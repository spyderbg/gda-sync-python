"""Preview resource moves and RssKey renames using exact JSON string spans.

Planning is read-only. Every input, including sibling descriptors and existing targets, is fingerprinted;
application belongs to Library, which re-plans under its operation lock before touching files.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path

from egt_gda_sync.assets.views import ELEMENT_KINDS
from egt_gda_sync.sync.rss_declare import KINDS
from egt_gda_sync.sync.rss_edit import Node, parse, walk
from egt_gda_sync.sync.rss_schemas import DOCUMENT_TYPES, parse_dataclass
from egt_gda_sync.sync.rss_sync import COMMON_DIR, RANGE_PATTERN, declared_paths, expand_path, load_documents


@dataclass
class Reference:
    file: str
    start: int
    end: int
    line: int
    field: str
    value: str
    category: str
    kinds: tuple[str, ...] = ()
    files: tuple[str, ...] = ()

    @property
    def id(self) -> str:
        return hashlib.sha256(f'{self.file}:{self.start}:{self.field}'.encode()).hexdigest()[:24]


@dataclass
class Index:
    game: Path
    resources: Path
    texts: dict[str, str] = field(default_factory=dict)
    revisions: dict[str, str] = field(default_factory=dict)
    refs: list[Reference] = field(default_factory=list)
    descriptors: set[str] = field(default_factory=set)


@dataclass
class Plan:
    files: list[dict] = field(default_factory=list)
    edits: dict[str, list[dict]] = field(default_factory=dict)
    blockers: list[dict] = field(default_factory=list)
    warnings: list[dict] = field(default_factory=list)
    revisions: dict[str, str] = field(default_factory=dict)
    fingerprint: str = ''

    def issue(self, code: str, message: str, files=(), *, warning: bool = False) -> None:
        item = {'code': code, 'message': message, 'files': sorted(set(map(str, files)))}
        bucket = self.warnings if warning else self.blockers
        if item not in bucket:
            bucket.append(item)

    def finish(self) -> Plan:
        self.files.sort(key=lambda item: (item['source'], item['target']))
        self.fingerprint = ''
        self.fingerprint = hashlib.sha256(json.dumps(asdict(self), sort_keys=True, ensure_ascii=True).encode()).hexdigest()
        return self

    def json(self) -> dict:
        return asdict(self)


def sha256(file: Path) -> str:
    if not file.exists():
        return 'missing'
    if not file.is_file():
        return 'directory'
    with file.open('rb') as handle:
        digest = hashlib.sha256()
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _read(index: Index, file: Path) -> str:
    data = file.read_bytes()
    index.revisions[str(file)] = hashlib.sha256(data).hexdigest()
    text = data.decode('utf-8-sig')
    index.texts[str(file)] = text
    return text


def _field(key: tuple) -> str:
    return '.'.join(str(part) for part in key)


def _reference(file: Path, text: str, key: tuple, node: Node, category: str, kinds=(), files=()) -> Reference:
    return Reference(str(file), node.start, node.end, text.count('\n', 0, node.start) + 1,
                     _field(key), node.value, category, tuple(kinds), tuple(map(str, files)))


def references(game_dir: Path, resources_dir: Path) -> Index:
    """Index descriptor paths/keys and JSON values in the game and included descriptor folders."""
    game_dir, resources_dir = game_dir.resolve(), resources_dir.resolve()
    index = Index(game_dir, resources_dir)
    documents = load_documents(game_dir, required=False)
    lists = {value.list: kind for kind, value in KINDS.items()}
    lists['styles'] = 'TextStyle'
    for file in documents:
        if not file.is_relative_to(resources_dir):
            raise ValueError(f'Included descriptor is outside the resources folder: {file}')
    index.descriptors = set(map(str, documents))
    roots = {game_dir, *(file.parent for file in documents if not file.is_relative_to(game_dir))}
    json_files = set(documents)
    # A declared view or idata file may be shared without an included descriptor beside it.
    # Its references still participate, especially in the common-file blocker.
    for document in documents.values():
        for template, _sequence, _entry in declared_paths(document):
            for relative in expand_path(template):
                file = (game_dir / relative).resolve()
                if file.is_relative_to(resources_dir) and file.suffix.lower() == '.json' and file.is_file():
                    json_files.add(file)
    text_files: set[Path] = set()
    for root in sorted(roots):
        json_files.update(file.resolve() for file in root.rglob('*') if file.is_file() and file.suffix.lower() == '.json')
        text_files.update(file.resolve() for file in root.rglob('*') if file.is_file()
                          and file.suffix.lower() in {'.ini', '.csv', '.xml', '.lua', '.txt'})
    for file in sorted(json_files | text_files):
        if not file.is_relative_to(resources_dir):
            raise ValueError(f'Reference file is outside the resources folder: {file}')
        text = _read(index, file)
        if file in text_files:
            continue
        root = parse(text)
        nodes = dict(walk(root))
        for key, node in walk(root):
            if not isinstance(node.value, str):
                continue
            descriptor = str(file) in index.descriptors
            if descriptor and key and (key[-1] == 'path' or len(key) >= 2 and key[-2] == 'samples'):
                paths = [(game_dir / path).resolve() for path in expand_path(node.value)]
                index.refs.append(_reference(file, text, key, node, 'path', files=paths))
            elif descriptor and len(key) >= 3 and key[-1] == 'id' and key[-3] in lists:
                index.refs.append(_reference(file, text, key, node, 'declaration', [lists[key[-3]]]))
            elif key and key[-1] == 'font_id':
                index.refs.append(_reference(file, text, key, node, 'structural', ['Font']))
            elif key and (key[-1] in ('rssKey', 'rssStyleId') or len(key) >= 2 and key[-2] == 'rssKeys'):
                parent_key = key[:-2] if isinstance(key[-1], int) else key[:-1]
                parent = nodes.get(parent_key)
                type_node = parent.member('type') if parent else None
                kinds = ['TextStyle'] if key[-1] == 'rssStyleId' else ELEMENT_KINDS.get(type_node.value if type_node else '', ())
                index.refs.append(_reference(file, text, key, node, 'structural' if kinds else 'value', kinds))
            elif not descriptor:
                index.refs.append(_reference(file, text, key, node, 'value'))
    return index


def other_users(resources_dir: Path, game_dir: Path, files, revisions: dict | None = None) -> list[dict]:
    """Sibling games declaring these files, including references in descriptors they include."""
    wanted = set(map(lambda path: Path(path).resolve(), files))
    users = []
    for sibling in sorted(resources_dir.iterdir()):
        if not sibling.is_dir() or sibling.resolve() == game_dir.resolve() or sibling.name == COMMON_DIR:
            continue
        documents = load_documents(sibling, required=False)
        for descriptor, document in documents.items():
            if not descriptor.is_relative_to(resources_dir.resolve()):
                raise ValueError(f'Included descriptor is outside resources: {descriptor}')
            if revisions is not None:
                revisions[str(descriptor)] = sha256(descriptor)
            for template, _sequence, entry in declared_paths(document):
                matches = wanted & {(sibling / path).resolve() for path in expand_path(template)}
                if matches:
                    users.append({'game': sibling.name, 'descriptor': str(descriptor), 'kind': type(entry).__name__,
                                  'key': getattr(entry, 'id', None), 'files': sorted(map(str, matches))})
    return users


def _edit(plan: Plan, ref: Reference, new: str, selected: bool = True) -> None:
    plan.edits.setdefault(ref.file, []).append({'id': ref.id, 'start': ref.start, 'end': ref.end, 'line': ref.line,
                                               'field': ref.field, 'old': ref.value, 'new': new,
                                               'category': ref.category, 'selected': selected})


def _editable(plan: Plan, index: Index, ref: Reference) -> bool:
    file = Path(ref.file)
    if file.is_relative_to(index.game):
        return True
    users = other_users(index.resources, index.game, ref.files, plan.revisions) if ref.files else []
    # Includes themselves are useful even when the held reference is a key rather than a path.
    includers = []
    for sibling in sorted(index.resources.iterdir()):
        if sibling.is_dir() and sibling.name != COMMON_DIR:
            documents = load_documents(sibling, required=False)
            for path in documents:
                plan.revisions[str(path)] = sha256(path)
            if file in documents or any(file.is_relative_to(path.parent) for path in documents if not path.is_relative_to(sibling)):
                includers.append(sibling.name)
    games = sorted(set(includers + [item['game'] for item in users]))
    plan.issue('common-reference', f'{file.name} is outside this game and cannot be edited. Games that include its folder: '
               + (', '.join(games) or 'this game') + '.', [file])
    return False


def plan_move(index: Index, mapping, game_dir: Path, resources_dir: Path) -> Plan:
    """A read-only move/copy plan. The Library validates destination names and safe paths as well."""
    game_dir, resources_dir = game_dir.resolve(), resources_dir.resolve()
    mapping = {Path(old).absolute(): Path(new).absolute() for old, new in mapping.items()}
    plan = Plan(revisions=dict(index.revisions))
    targets: dict[str, Path] = {}
    users = other_users(resources_dir, game_dir, mapping, plan.revisions)
    for source, target in sorted(mapping.items()):
        if target in mapping and mapping[target] != target and source != target:
            plan.issue('overlapping-move', 'A target is also a source being moved. Choose a separate target folder.', [source, target])
        plan.revisions[str(source)] = sha256(source)
        plan.revisions[str(target)] = sha256(target)
        if not source.is_relative_to(resources_dir) or source.is_symlink() or source.resolve() != source:
            plan.issue('unsafe-source', 'The source must be a regular file inside the resources folder.', [source])
            continue
        if not target.is_relative_to(game_dir) or target.resolve() != target:
            plan.issue('unsafe-target', 'The target must stay inside the game folder, without symbolic links.', [target])
            continue
        try:
            names = target.relative_to(game_dir).parts
            invalid_name = any(part.endswith((' ', '.')) or re.search(r'[<>:"|?*\x00-\x1f]', part)
                               or re.fullmatch(r'(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?', part) for part in names)
            str(target).encode('utf-8')
        except UnicodeEncodeError:
            invalid_name = True
        if invalid_name or any(parent.exists() and not parent.is_dir() for parent in target.parents if parent != target):
            plan.issue('invalid-target', 'The target contains an invalid name or its parent is not a directory.', [target])
            continue
        if not source.is_file():
            plan.issue('missing-source', 'The source file does not exist.', [source])
            continue
        if source == target:
            continue
        folded = str(target).casefold()
        if folded in targets and targets[folded] != source:
            plan.issue('target-collision', 'Two sources would have the same target, including case-only differences.', [source, targets[folded], target])
        targets[folded] = source
        # Check existing case-only matches on case-sensitive systems too, including parent directories.
        parent = game_dir
        for part in target.relative_to(game_dir).parts:
            if parent.is_dir():
                clash = next((p for p in parent.iterdir() if p.name.casefold() == part.casefold() and p.name != part), None)
                if clash:
                    plan.issue('case-collision', 'A target differs only in case from an existing path.', [target, clash])
            parent /= part
        mode = 'move' if source.is_relative_to(game_dir) else 'copy'
        shared = [user for user in users if str(source) in user['files']]
        if mode == 'move' and shared:
            mode = 'copy'
            plan.issue('other-users', 'The source stays because other games use it: ' + ', '.join(sorted({user['game'] for user in shared})), [source], warning=True)
        if target.exists():
            if not target.is_file() or plan.revisions[str(target)] != plan.revisions[str(source)]:
                plan.issue('target-exists', 'The target already exists with different contents.', [target])
            else:
                mode = 'reuse'
        plan.files.append({'source': str(source), 'target': str(target), 'mode': mode, 'size': source.stat().st_size,
                           'sha256': plan.revisions[str(source)]})
        if source.suffix.lower() == '.json' and 'v' in source.relative_to(resources_dir).parts:
            old_parts, new_parts = source.parts, target.parts
            if 'v' not in target.relative_to(game_dir).parts:
                plan.issue('view-folder', 'The view would be moved out of v/.', [source, target], warning=True)
            elif old_parts[old_parts.index('v') + 1:-1] != new_parts[new_parts.index('v') + 1:-1]:
                plan.issue('view-resolution', 'The view would be moved to another resolution folder.', [source, target], warning=True)
    for ref in index.refs:
        if ref.category != 'path' or not set(map(Path, ref.files)) & mapping.keys():
            continue
        old_files = list(map(Path, ref.files))
        new_files = [mapping.get(file, file) for file in old_files]
        if RANGE_PATTERN.search(ref.value):
            parents = {file.parent for file in new_files}
            if len(parents) != 1 or any(old.name != new.name for old, new in zip(old_files, new_files)):
                plan.issue('split-sequence', "The sequence's frames would be split or renamed.", ref.files)
                continue
            new = (Path(os.path.relpath(new_files[0].parent, game_dir)) / Path(ref.value.replace('\\', '/')).name).as_posix()
        else:
            new = Path(os.path.relpath(new_files[0], game_dir)).as_posix()
        if new != ref.value and _editable(plan, index, ref):
            _edit(plan, ref, new)
    # A descriptor is part of the index; moving it also needs include and file-span relocation, which is unsafe here.
    for source in mapping:
        if str(source) in index.descriptors and mapping[source] != source:
            plan.issue('descriptor-move', 'Resource descriptors cannot be moved as assets.', [source])
    return plan.finish()


def plan_key_rename(index: Index, kind: str, old: str, new: str, excluded=()) -> Plan:
    plan = Plan(revisions=dict(index.revisions))
    excluded = set(excluded)
    plan.issue('game-code', "The game's code is not checked. Update any references there separately.", warning=True)
    if not re.fullmatch(r'[A-Za-z0-9_]{1,200}', new):
        plan.issue('invalid-key', 'Use 1–200 letters, digits or underscores for the new RssKey.')
    declarations = [ref for ref in index.refs if ref.category == 'declaration' and kind in ref.kinds and ref.value == old]
    if not declarations:
        plan.issue('missing-key', 'The key is no longer declared. Rescan and preview again.')
    if old == new:
        plan.issue('unchanged-key', 'Choose a different RssKey.')
    for ref in index.refs:
        if ref.category == 'declaration' and ref.value == new and ref not in declarations:
            same = kind in ref.kinds
            plan.issue('key-collision' if same else 'other-kind',
                       f'The new key already exists as {", ".join(ref.kinds)}.', [ref.file], warning=not same)
    outside = 0
    for ref in index.refs:
        if ref.value != old or ref.category == 'path':
            continue
        if ref.category in ('declaration', 'structural') and kind not in ref.kinds:
            continue
        if ref.category not in ('declaration', 'structural', 'value'):
            continue
        if ref.file not in index.descriptors:
            outside += 1
        # Common references block even if an optional value match was excluded.
        if _editable(plan, index, ref):
            _edit(plan, ref, new, ref.category != 'value' or ref.id not in excluded)
    expression = re.compile(r'(?<![A-Za-z0-9_])' + re.escape(old) + r'(?![A-Za-z0-9_])')
    for file, text in index.texts.items():
        if Path(file).suffix.lower() in {'.ini', '.csv', '.xml', '.lua', '.txt'} and expression.search(text):
            plan.issue('text-reference', 'Text contains the key; review and update it separately.', [file], warning=True)
    if not outside:
        plan.issue('no-references', "No JSON reference outside declarations was found; the game's code may use this key.", warning=True)
    return plan.finish()


def apply_edits(text: str, edits: list[dict], descriptor: Path | None = None) -> str:
    """Replace only selected string spans; preserve surrounding formatting, CRLF and an optional BOM."""
    bom = text.startswith('\ufeff')
    if bom:
        text = text[1:]
    previous = len(text) + 1
    for edit in sorted((item for item in edits if item.get('selected', True)), key=lambda item: item['start'], reverse=True):
        start, end = edit['start'], edit['end']
        if end > previous or json.loads(text[start:end]) != edit['old']:
            raise ValueError('The reference text changed; preview again.')
        text = text[:start] + json.dumps(edit['new'], ensure_ascii=False) + text[end:]
        previous = start
    result = json.loads(text)
    if descriptor and descriptor.name in DOCUMENT_TYPES:
        parse_dataclass(DOCUMENT_TYPES[descriptor.name], result, str(descriptor))
    return ('\ufeff' if bom else '') + text
