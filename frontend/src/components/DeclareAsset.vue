<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { assetSection, number, plural, sectionIcons, sectionSingular } from '../format';
import type { DeclarationKind, DeclarationKindOptions, DeclarationOptions, DeclarationValue, ReportAsset } from '../types';
import { busy, declarationOptions, declareAsset } from '../workspace';
import AppModal from './AppModal.vue';
import CheckBox from './CheckBox.vue';

// Create the RSS key of an asset that no descriptor declares: a new entry for it in a *Data.json descriptor of the
// game, which the asset report then lists. The asset's type gives the kinds of entries that can declare it, the usual
// one first, and each kind has the fields that the games' descriptors give it. The form starts with every field of the kind,
// those most of the game's entries have at their most common value; an optional field can be taken away, and Add field
// brings it back. A field left empty is not written. The game's own entries suggest a key named like theirs and the values of
// each field; a resolution, a language and an integration are chosen among those the game uses, or typed. The entry is shown beside the
// form as it will be written, with the part of the field being edited highlighted.
const props = defineProps<{ row: ReportAsset }>();
const emit = defineEmits<{ close: [] }>();

type Input = 'text' | 'choice' | 'chars' | 'integer' | 'number' | 'boolean' | 'area';
const FIELDS: Record<string, { label: string; input: Input; hint: string }> = {
  resolution: { label: 'Resolution', input: 'choice', hint: 'The screen resolution it is for. Not specified for every resolution.' },
  language: { label: 'Language', input: 'choice', hint: 'The language it is for. Not specified for every language.' },
  integration: { label: 'Integration', input: 'choice', hint: 'The integration it is for, such as ares. Not specified for the default entry.' },
  source: { label: 'Source', input: 'area', hint: 'The part of the image it shows, in pixels. Empty for the whole image.' },
  frameTime: { label: 'Frame time', input: 'integer', hint: 'Milliseconds per frame.' },
  loopCount: { label: 'Loop count', input: 'integer', hint: 'How many times it plays; 0 loops forever.' },
  loopTo: { label: 'Loop to', input: 'integer', hint: 'The frame that later loops start at. Empty for the first.' },
  polyphonyGroup: { label: 'Polyphony group', input: 'choice', hint: 'The group of sounds that it plays in. Not specified for none.' },
  loop: { label: 'Loop', input: 'boolean', hint: 'Plays again when it ends.' },
  fadeIn: { label: 'Fade in', input: 'number', hint: 'Seconds.' },
  fadeOut: { label: 'Fade out', input: 'number', hint: 'Seconds.' },
  chars: { label: 'Characters', input: 'chars', hint: 'The groups of characters it draws; Other types them as plain text, such as 0123456789.' },
  size: { label: 'Size', input: 'integer', hint: 'Pixels.' },
  dataType: { label: 'Data type', input: 'choice', hint: 'The type that reads the file, such as Egt::Game::AlphaFamily::InfoViewConfig.' },
  movieFormat: { label: 'Movie format', input: 'text', hint: 'How the movie is encoded, such as valpha.' },
};
// The fields whose x button empties them instead of taking them from the form.
const RESET = ['source', 'fadeIn', 'fadeOut'];
// The fields that the asset's files fill in.
const FILE_FIELDS = ['path', 'frames', 'samples'];
const AREA = ['x', 'y', 'w', 'h'] as const;
// The option of a resolution, language or integration dropdown that types another value.
const OTHER = '__other__';
// A group of characters: a code point or a range of them.
const GROUP = /\[U\+[0-9a-f]+(?:-U\+[0-9a-f]+)?\]/gi;
// What a dropdown's typed value looks like.
const PLACEHOLDERS: Record<string, string> = {
  resolution: '1920x1080', language: 'en-GB', integration: 'ares', polyphonyGroup: 'reels', dataType: 'Egt::Game::AlphaFamily::InfoViewConfig',
};
const RESOLUTION = /(?<!\d)\d{3,5}x\d{3,5}(?!\d)/g;

const options = ref<DeclarationOptions | null>(null);
const loadError = ref('');
const kindName = ref<DeclarationKind | null>(null);
const descriptor = ref('');
const key = ref('');
const form = reactive<Record<string, string | number | boolean>>({});
const area = reactive<Record<(typeof AREA)[number], string | number>>({ x: '', y: '', w: '', h: '' });
// The fields in the form, the dropdowns whose value is typed instead, and the field being edited.
const shown = ref<string[]>([]);
const typed = reactive<Record<string, boolean>>({});
// The groups of characters of a font, each a code point or range from the list or typed.
const groups = ref<{ value: string; typed: boolean }[]>([]);
const focused = ref('');
const keyInput = ref<HTMLInputElement>();
const body = ref<HTMLElement>();
const previewPane = ref<HTMLElement>();

const name = computed(() => props.row.resource.split('/').pop() ?? props.row.resource);
const section = computed(() => assetSection(props.row));
const kind = computed<DeclarationKindOptions | null>(() => options.value?.kinds.find(item => item.kind === kindName.value) ?? null);
const paths = computed(() => options.value?.paths ?? []);
// Every field of the kind that the form can have, those in it, and those Add field adds, in the descriptors' order.
const fields = computed(() => (kind.value?.fields ?? []).filter(field => field !== 'id' && !FILE_FIELDS.includes(field) && FIELDS[field]));
const visible = computed(() => fields.value.filter(field => shown.value.includes(field)));
const addable = computed(() => fields.value.filter(field => !shown.value.includes(field)));
const required = (field: string) => !!kind.value?.required.includes(field);
const hasKey = computed(() => !!kind.value?.fields.includes('id'));
const frames = computed(() => props.row.sequence?.frames.length ?? 0);

/** Start from the kind's suggested key and defaults, with every field of the kind. */
function choose(next: DeclarationKind) {
  kindName.value = next;
  const current = kind.value!;
  key.value = current.id ?? '';
  descriptor.value = current.descriptors[0] ?? '';
  for (const field of Object.keys(form)) delete form[field];
  for (const field of Object.keys(typed)) delete typed[field];
  for (const field of fields.value) clear(field);
  for (const axis of AREA) area[axis] = '';
  shown.value = [...fields.value];
}

/** A field back at its default, or empty. */
function clear(field: string) {
  if (field === 'chars') {
    groups.value = DEFAULT_CHARS.map(value => ({ value, typed: false }));
    return;
  }
  const value = kind.value?.values[field]?.default ?? null;
  form[field] = FIELDS[field].input === 'boolean' ? value === true : value === null ? '' : String(value);
  typed[field] = FIELDS[field].input === 'choice' && value !== null && !choices(field).some(([choice]) => choice === String(value));
}

onMounted(async () => {
  try {
    options.value = await declarationOptions(props.row.id);
    if (options.value.kinds.length) choose(options.value.kinds[0].kind);
    await nextTick();
    keyInput.value?.focus();
    keyInput.value?.select();
  } catch (e) { loadError.value = (e as Error).message; }
});

async function add(field: string) {
  if (!field) return;
  shown.value = [...shown.value, field];
  await nextTick();
  body.value?.querySelector<HTMLElement>(`#declare-${field}, #declare-${field}-x`)?.focus();
}
/** A field back to nothing, and the field kept: the source's values emptied, or a fade's seconds. */
function reset(field: string) {
  if (field === 'source') for (const axis of AREA) area[axis] = '';
  else clear(field);
}
function remove(field: string) {
  shown.value = shown.value.filter(item => item !== field);
  clear(field);
  if (field === 'source') for (const axis of AREA) area[axis] = '';
  focused.value = '';
}

/** The values of a dropdown such as the resolution, language or integration: the kind's, then those of the game's other entries, and for a
 * resolution, one in the asset's path, each with how many entries have it; for characters, then the presets. */
function choices(field: string): [string, number][] {
  const counts = new Map<string, number>();
  for (const [value, count] of options.value?.choices[field as 'resolution' | 'language' | 'integration'] ?? []) counts.set(value, count);
  const result = new Map<string, number>();
  for (const [value, count] of kind.value?.values[field]?.values ?? []) result.set(String(value), counts.get(String(value)) ?? count);
  for (const [value, count] of counts) if (!result.has(value)) result.set(value, count);
  if (field === 'resolution') for (const token of paths.value.flatMap(path => path.match(RESOLUTION) ?? [])) if (!result.has(token)) result.set(token, 0);
  return [...result];
}
function pick(field: string, value: string) {
  typed[field] = value === OTHER;
  form[field] = value === OTHER ? '' : value;
  if (value === OTHER) void nextTick(() => body.value?.querySelector<HTMLElement>(`#declare-${field}-typed`)?.focus());
}

/** Characters typed as plain text as the descriptors write them: their code points, each range of consecutive ones as
 * [U+0030-U+0039]. Text that is in that notation already is kept. */
function codePoints(text: string) {
  if (/^(\[U\+[0-9a-f]+(-U\+[0-9a-f]+)?\])+$/i.test(text)) return text;
  const points = [...new Set([...text].map(char => char.codePointAt(0)!))].sort((a, b) => a - b);
  const hex = (point: number) => `U+${point.toString(16).toUpperCase().padStart(4, '0')}`;
  const ranges: string[] = [];
  for (let index = 0; index < points.length;) {
    let end = index;
    while (points[end + 1] === points[end] + 1) end++;
    ranges.push(`[${hex(points[index])}${end > index ? `-${hex(points[end])}` : ''}]`);
    index = end + 1;
  }
  return ranges.join('');
}

// The groups that a new font starts with: the digits and the English letters.
const DEFAULT_CHARS = ['[U+0030-U+0039]', '[U+0041-U+005A]', '[U+0061-U+007A]'];
// Groups of characters that a font can be given besides those the game's fonts have: digits, their separators and
// currencies, and the Latin alphabets with the other scripts the games use.
const CHAR_PRESETS = [
  '[U+0020]', '[U+0030-U+0039]', '[U+002E]', '[U+002C]', '[U+003A]', '[U+003D]', '[U+002B]', '[U+0078]', '[U+0024]', '[U+20AC]', '[U+00A3]', '[U+0040]',
  '[U+0041-U+005A]', '[U+0061-U+007A]', '[U+0020-U+007E]', '[U+0020-U+00FF]', '[U+0100-U+01FF]', '[U+0370-U+03FF]', '[U+0400-U+052F]', '[U+20A4-U+20AC]',
];

/** The characters that groups such as [U+0020-U+007E] stand for, a space as ␣, without the control characters, and cut
 * after a number of them. */
function glyphs(notation: string, limit: number) {
  let result = '';
  let count = 0;
  for (const [, from, to] of notation.matchAll(/\[U\+([0-9a-f]+)(?:-U\+([0-9a-f]+))?\]/gi)) {
    for (let point = parseInt(from, 16); point <= parseInt(to ?? from, 16) && point <= 0x10ffff; point++) {
      if (point < 0x20 || (point >= 0x7f && point < 0xa0) || (point >= 0xd800 && point < 0xe000)) continue;
      if (++count > limit) return `${result}…`;
      result += point === 0x20 ? '␣' : String.fromCodePoint(point);
    }
  }
  return result;
}

/** The groups of characters a font can have: those in the sets of the game's fonts, then the presets, the ranges before
 * the single characters. */
const groupChoices = computed(() => {
  const result = new Set<string>();
  for (const [value] of kind.value?.values.chars?.values ?? []) for (const group of String(value).match(GROUP) ?? []) result.add(group);
  for (const preset of CHAR_PRESETS) result.add(preset);
  const groups = [...result];
  return [...groups.filter(group => group.includes('-')), ...groups.filter(group => !group.includes('-'))];
});
/** The groups of characters that a group of the font is. */
const tokensOf = (group: { value: string; typed: boolean }) => (group.typed ? codePoints(group.value) : group.value).match(GROUP) ?? [];
/** What a group can be picked from: those that no other group has. */
const groupOptions = (index: number) => {
  const taken = new Set(groups.value.flatMap((group, other) => (other === index ? [] : tokensOf(group))));
  return groupChoices.value.filter(value => !taken.has(value));
};
const canAddGroup = computed(() => {
  const taken = new Set(groups.value.flatMap(tokensOf));
  return groupChoices.value.some(value => !taken.has(value));
});
function pickGroup(index: number, value: string) {
  groups.value[index] = { value: value === OTHER ? '' : value, typed: value === OTHER };
  if (value === OTHER) void nextTick(() => body.value?.querySelector<HTMLElement>(`#declare-chars-typed-${index}`)?.focus());
}
async function addGroup() {
  groups.value.push({ value: '', typed: false });
  await nextTick();
  body.value?.querySelector<HTMLElement>(`#declare-chars-${groups.value.length - 1}`)?.focus();
}

/** A field's value as the entry has it, nothing when it is empty, or what it must be instead. */
function parse(field: string): { value?: DeclarationValue; error?: string } {
  if (field === 'chars') {
    const value = [...new Set(groups.value.flatMap(tokensOf))].join('');
    return value ? { value } : {};
  }
  const raw = form[field];
  if (FIELDS[field].input === 'boolean') return raw === true ? { value: true } : {};
  const text = String(raw ?? '').trim();
  if (!text) return {};
  if (FIELDS[field].input === 'integer') return /^\d+$/.test(text) ? { value: Number(text) } : { error: 'a whole number' };
  if (FIELDS[field].input === 'number') return /^\d+(\.\d+)?$/.test(text) ? { value: Number(text) } : { error: 'a number of 0 or more' };
  return { value: text };
}
const areaValues = computed(() => AREA.map(axis => String(area[axis]).trim()));
// What an axis of the source is when left empty while another is set: the top left corner, and the image's width and height.
const areaDefault = (axis: (typeof AREA)[number]) => ({ x: 0, y: 0, w: props.row.dimensions?.width, h: props.row.dimensions?.height })[axis];
const areaValue = computed(() => {
  if (!areaValues.value.some(Boolean)) return null;
  const values = AREA.map((axis, index) => (areaValues.value[index] ? (/^\d+$/.test(areaValues.value[index]) ? Number(areaValues.value[index]) : undefined) : areaDefault(axis)));
  return values.every(value => value !== undefined) ? Object.fromEntries(AREA.map((axis, index) => [axis, values[index]])) as Record<(typeof AREA)[number], number> : null;
});

/** What keeps the entry from being created. */
const problems = computed(() => {
  const current = kind.value;
  if (!current) return [];
  const result: string[] = [];
  if (!current.descriptors.length) result.push(`The game folder has no descriptor that holds ${current.list}.`);
  if (hasKey.value && !key.value.trim()) result.push('Enter the RSS key.');
  for (const field of visible.value) {
    if (FIELDS[field].input === 'area') continue;
    const { value, error } = parse(field);
    if (error) result.push(`${FIELDS[field].label} must be ${error}.`);
    else if (value === undefined && required(field)) result.push(`Enter the ${FIELDS[field].label.toLowerCase()}.`);
  }
  if (visible.value.includes('source') && areaValues.value.some(Boolean) && (!areaValue.value || !areaValue.value.w || !areaValue.value.h)) {
    result.push('The source needs whole numbers, and a width and a height above 0.');
  }
  const loopTo = visible.value.includes('loopTo') ? parse('loopTo').value : undefined;
  if (typeof loopTo === 'number' && frames.value && loopTo >= frames.value) result.push(`The sequence has ${frames.value} frames, from 0 to ${frames.value - 1}.`);
  return result;
});
// Entries of one key are variants that the game picks between by resolution, language or integration.
const sameKey = computed(() => !!kind.value?.ids.includes(key.value.trim()));

/** The entry as the descriptor will have it, in the order the descriptors write its fields. */
const entry = computed(() => {
  const result: Record<string, unknown> = {};
  for (const field of kind.value?.fields ?? []) {
    if (field === 'id') { if (key.value.trim()) result.id = key.value.trim(); }
    else if (field === 'path') result.path = paths.value[0];
    else if (field === 'frames') result.frames = paths.value.map(path => ({ path }));
    else if (field === 'samples') result.samples = [...paths.value];
    else if (!visible.value.includes(field)) continue;
    else if (field === 'source') { if (areaValue.value) result.source = areaValue.value; }
    else {
      const { value } = parse(field);
      if (value !== undefined) result[field] = value;
    }
  }
  return result;
});

// The entry's lines, each with the field it writes and its tokens, colored as JSON.
const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)|\b(true|false|null)\b/g;
function tokens(text: string) {
  const result: { text: string; kind?: string }[] = [];
  let index = 0;
  for (const match of text.matchAll(TOKEN)) {
    if (match.index! > index) result.push({ text: text.slice(index, match.index) });
    if (match[1]) result.push({ text: match[1], kind: match[2] ? 'key' : 'string' }, ...(match[2] ? [{ text: match[2] }] : []));
    else result.push({ text: match[0], kind: match[3] ? 'number' : 'literal' });
    index = match.index! + match[0].length;
  }
  if (index < text.length) result.push({ text: text.slice(index) });
  return result;
}
const lines = computed(() => {
  const names = Object.keys(entry.value);
  const result = [{ field: '', text: '{' }];
  names.forEach((field, index) => {
    const parts = JSON.stringify(entry.value[field], null, 4).split('\n');
    parts.forEach((part, line) => result.push({
      field, text: `${line ? '    ' : `    "${field}": `}${part}${line === parts.length - 1 && index < names.length - 1 ? ',' : ''}`,
    }));
  });
  result.push({ field: '', text: '}' });
  return result.map(line => ({ ...line, tokens: tokens(line.text) }));
});
watch(focused, async field => {
  await nextTick();
  if (field) previewPane.value?.querySelector('.is-focused')?.scrollIntoView({ block: 'nearest' });
});

/** What the field being edited is, and how many of the game's entries of the kind have it. */
const help = computed(() => {
  const current = kind.value;
  const field = focused.value;
  if (!current || !field) return '';
  if (field === 'id') return sameKey.value ? '' : `The id the game loads it by, named like the game's other ${current.kind} entries.`;
  if (!FIELDS[field]) return '';
  const used = current.values[field]?.used ?? 0;
  const usage = current.entries ? `${number(used)} of ${number(current.entries)} ${current.kind} entr${current.entries === 1 ? 'y has' : 'ies have'} it.` : '';
  return `${FIELDS[field].hint} ${usage}`;
});
/** The characters of a font's groups, shown on a line of their own below the description. */
const helpGlyphs = computed(() => (focused.value === 'chars' && parse('chars').value ? glyphs(String(parse('chars').value), 400) : ''));
const suggestions = (field: string) => kind.value?.values[field]?.values ?? [];

function onFocus(event: FocusEvent) {
  focused.value = (event.target as HTMLElement).closest<HTMLElement>('[data-field]')?.dataset.field ?? '';
}

async function create() {
  if (!kind.value || problems.value.length || busy.value) return;
  const { path: _path, frames: _frames, samples: _samples, ...values } = entry.value;
  if (await declareAsset({ asset: props.row.id, kind: kind.value.kind, descriptor: descriptor.value, ...values })) emit('close');
}
</script>

<template>
  <AppModal :title="`Create RssKey ${name}`" wide stacked dialog-class="declare-dialog" @close="emit('close')">
    <form ref="body" class="modal-body declare-body" @submit.prevent="create" @focusin="onFocus">
      <p v-if="loadError" class="text-danger mb-0" role="alert">{{ loadError }}</p>
      <p v-else-if="!options" class="text-muted mb-0"><i aria-hidden="true" class="mdi mdi-loading mdi-spin" /> Reading the game's descriptors…</p>
      <p v-else-if="!kind" class="text-muted mb-0">No kind of entry can declare this asset.</p>
      <div v-else class="declare-layout">
        <section class="declare-fields" aria-label="Fields">
          <div class="declare-field">
            <span class="declare-label">Asset</span>
            <span class="declare-type text-muted"><i aria-hidden="true" :class="['mdi', sectionIcons[section]]" /> {{ sectionSingular[section] }}<template v-if="row.sequence">, {{ number(frames) }} frame{{ plural(frames) }}</template></span>
          </div>

          <div v-if="hasKey" class="declare-field" data-field="id">
            <label class="declare-label" for="declare-key">RSS key <span class="text-danger" aria-hidden="true">*</span></label>
            <input id="declare-key" ref="keyInput" v-model="key" class="form-control form-control-sm declare-code" required maxlength="200" spellcheck="false" autocomplete="off">
          </div>
          <p v-if="hasKey && sameKey" class="declare-note text-warning">Another {{ kind.kind }} entry has this key: the game picks between entries of one key by their resolution, language or integration.</p>
          <p v-if="!hasKey" class="declare-note text-muted">{{ kind.kind }} entries have no key: the game reads the file as it is.</p>

          <div v-for="field in visible" :key="field" class="declare-field" :data-field="field">
            <label class="declare-label" :for="FIELDS[field].input === 'area' ? `declare-${field}-x` : field === 'chars' ? 'declare-chars-0' : `declare-${field}`">
              {{ FIELDS[field].label }} <span v-if="required(field)" class="text-danger" aria-hidden="true">*</span>
            </label>
            <div v-if="FIELDS[field].input === 'area'" class="declare-area">
              <label v-for="axis in AREA" :key="axis" class="declare-axis">
                <span>{{ axis }}</span>
                <input :id="`declare-${field}-${axis}`" v-model="area[axis]" type="number" min="0" step="1" class="form-control form-control-sm"
                       :aria-label="`Source ${axis}`" :placeholder="axis === 'w' ? String(row.dimensions?.width ?? '') : axis === 'h' ? String(row.dimensions?.height ?? '') : '0'">
              </label>
            </div>
            <CheckBox v-else-if="FIELDS[field].input === 'boolean'" class="declare-check" :checked="form[field] === true" :label="FIELDS[field].label" @change="form[field] = $event"><span class="declare-check-text">{{ FIELDS[field].hint }}</span></CheckBox>
            <div v-else-if="FIELDS[field].input === 'chars'" class="declare-groups">
              <div v-for="(group, index) in groups" :key="index" class="declare-choice">
                <select :id="`declare-chars-${index}`" class="form-control form-control-sm declare-code" :aria-label="`Characters group ${index + 1}`"
                        :value="group.typed ? OTHER : group.value" @change="pickGroup(index, ($event.target as HTMLSelectElement).value)">
                  <option value="" disabled>Select…</option>
                  <option v-for="value in groupOptions(index)" :key="value" :value="value">{{ value }}</option>
                  <option :value="OTHER">Other…</option>
                </select>
                <input v-if="group.typed" :id="`declare-chars-typed-${index}`" v-model="group.value" class="form-control form-control-sm"
                       :aria-label="`Other characters, group ${index + 1}`" placeholder="0123456789.,$€" spellcheck="false" autocomplete="off">
                <button type="button" class="details-icon declare-remove" :aria-label="`Remove group ${index + 1}`" :title="`Remove group ${index + 1}`" @click="groups.splice(index, 1)"><i aria-hidden="true" class="mdi mdi-close" /></button>
              </div>
              <button type="button" class="btn btn-light btn-sm declare-add-group" :disabled="!canAddGroup" @click="addGroup"><i aria-hidden="true" class="mdi mdi-plus" />Add group</button>
            </div>
            <div v-else-if="FIELDS[field].input === 'choice'" class="declare-choice">
              <select :id="`declare-${field}`" class="form-control form-control-sm" :value="typed[field] ? OTHER : String(form[field])" @change="pick(field, ($event.target as HTMLSelectElement).value)">
                <option v-if="required(field)" value="" disabled>Select…</option>
                <option v-else value="">Not specified</option>
                <option v-for="[value, count] in choices(field)" :key="value" :value="value">{{ value }}{{ count && field !== 'chars' ? ` (${number(count)})` : '' }}</option>
                <option :value="OTHER">Other…</option>
              </select>
              <input v-if="typed[field]" :id="`declare-${field}-typed`" v-model="form[field]" :class="['form-control', 'form-control-sm', 'declare-code']"
                     :aria-label="`Other ${FIELDS[field].label.toLowerCase()}`" :placeholder="PLACEHOLDERS[field]" spellcheck="false" autocomplete="off">
            </div>
            <template v-else>
              <input :id="`declare-${field}`" v-model="form[field]" :type="FIELDS[field].input === 'text' ? 'text' : 'number'" min="0"
                     :step="FIELDS[field].input === 'number' ? '0.1' : '1'" :list="suggestions(field).length ? `declare-${field}-values` : undefined"
                     :class="['form-control', 'form-control-sm']" :required="required(field)" spellcheck="false" autocomplete="off">
              <datalist v-if="suggestions(field).length" :id="`declare-${field}-values`">
                <option v-for="[value, count] in suggestions(field)" :key="String(value)" :value="String(value)">{{ number(count) }} entr{{ count === 1 ? 'y' : 'ies' }}</option>
              </datalist>
            </template>
            <button v-if="RESET.includes(field)" type="button" class="details-icon declare-remove" :aria-label="`Reset ${FIELDS[field].label}`" :title="`Reset ${FIELDS[field].label}`" @click="reset(field)"><i aria-hidden="true" class="mdi mdi-close" /></button>
            <button v-else-if="!required(field) && FIELDS[field].input !== 'choice'" type="button" class="details-icon declare-remove" :aria-label="`Remove ${FIELDS[field].label}`" :title="`Remove ${FIELDS[field].label}`" @click="remove(field)"><i aria-hidden="true" class="mdi mdi-close" /></button>
          </div>

          <div v-if="addable.length" class="declare-field" data-field="">
            <span class="declare-label" />
            <select class="form-control form-control-sm declare-add" aria-label="Add field" value="" @change="add(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
              <option value="" disabled>+ Add field…</option>
              <option v-for="field in addable" :key="field" :value="field">{{ FIELDS[field].label }} ({{ field }})</option>
            </select>
          </div>
          <p class="declare-help text-muted" aria-live="polite">{{ help }}<template v-if="helpGlyphs"><br><strong class="declare-glyphs">{{ helpGlyphs }}</strong></template></p>
        </section>

        <section class="declare-entry" aria-label="The new entry">
          <div v-if="options.kinds.length > 1" class="declare-field declare-kind" data-field="">
            <label class="declare-label" for="declare-kind">Declare as</label>
            <select id="declare-kind" class="form-control form-control-sm" :value="kindName" @change="choose(($event.target as HTMLSelectElement).value as DeclarationKind)">
              <option v-for="item in options.kinds" :key="item.kind" :value="item.kind">{{ item.kind }} ({{ item.list }})</option>
            </select>
          </div>
          <div v-if="kind.descriptors.length > 1" class="declare-field" data-field="">
            <label class="declare-label" for="declare-descriptor">Descriptor</label>
            <select id="declare-descriptor" v-model="descriptor" class="form-control form-control-sm">
              <option v-for="item in kind.descriptors" :key="item" :value="item">{{ item }}</option>
            </select>
          </div>
          <h6 class="declare-heading">{{ descriptor || kind.list }} · {{ kind.list }}</h6>
          <pre ref="previewPane" class="declare-preview"><span v-for="(line, index) in lines" :key="index" :class="['declare-line', { 'is-focused': focused && line.field === focused }]"><span v-for="(token, part) in line.tokens" :key="part" :class="token.kind && `json-${token.kind}`">{{ token.text }}</span></span></pre>
          <ul v-if="problems.length" class="declare-problems text-danger">
            <li v-for="problem in problems" :key="problem">{{ problem }}</li>
          </ul>
        </section>
      </div>
      <button type="submit" hidden />
    </form>
    <div class="modal-footer declare-footer">
      <span class="text-muted">The entry goes after the last one of the list; the descriptor's previous version is saved in your backups.</span>
      <button type="button" class="btn btn-light btn-sm" @click="emit('close')">Cancel</button>
      <button type="button" class="btn btn-primary btn-sm" :disabled="!kind || !!problems.length || !!busy" @click="create">
        <i v-if="busy === 'declare'" aria-hidden="true" class="mdi mdi-loading mdi-spin" />{{ busy === 'declare' ? 'Creating…' : 'Create' }}
      </button>
    </div>
  </AppModal>
</template>

<style scoped>
.declare-body { padding: 14px 16px; }
.declare-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
.declare-field { display: grid; grid-template-columns: 96px minmax(0, 1fr) 28px; align-items: center; column-gap: 6px; min-height: 31px; margin-bottom: 6px; }
.declare-label { margin: 0; color: #4a4a4a; font-size: 0.8125rem; line-height: 1.2; }
.declare-type { font-size: 0.8125rem; }
.declare-code { font-family: monospace; font-size: 0.8125rem; overflow-wrap: anywhere; }
.declare-note { margin: -2px 0 6px 102px; font-size: 0.75rem; }
.declare-area { display: flex; gap: 4px; }
.declare-axis { display: flex; flex: 1; align-items: center; gap: 2px; min-width: 0; margin: 0; }
.declare-axis span { color: #6c757d; font-family: monospace; font-size: 0.75rem; }
.declare-axis input { min-width: 0; padding-right: 2px; padding-left: 4px; }
.declare-choice { display: flex; align-items: center; gap: 4px; }
.declare-groups { display: grid; gap: 4px; }
.declare-add-group { justify-self: start; }
.declare-choice > * { min-width: 0; }
.declare-check { margin: 0; }
.declare-check-text { color: #6c757d; font-size: 0.75rem; }
.declare-remove { width: 24px; height: 24px; font-size: 13px; }
.declare-add { color: #4b49ac; }
.declare-glyphs { color: #3e4b5b; font-size: 0.875rem; overflow-wrap: anywhere; }
.declare-help { min-height: 2.4em; margin: 4px 0 0; font-size: 0.75rem; }
.declare-heading { margin: 0 0 6px; color: #6c757d; font-size: 11px; font-weight: 500; letter-spacing: 0.4px; overflow-wrap: anywhere; }
.declare-preview { max-height: 340px; margin: 0; padding: 8px 0; overflow: auto; border-radius: 6px; background: #f5f7ff; color: #3e4b5b; font-size: 12px; line-height: 1.5; }
.declare-line { display: block; padding: 0 10px; border-left: 3px solid transparent; }
.declare-line.is-focused { border-left-color: #4b49ac; background: #e1e0fa; }
.json-key { color: #4b49ac; }
.json-string { color: #1f8a4c; }
.json-number { color: #c25e00; }
.json-literal { color: #b0306d; }
.declare-problems { margin: 8px 0 0; padding-left: 1.1rem; font-size: 0.75rem; }
.declare-footer { padding: 8px 16px; }
.declare-footer > span { flex: 1; font-size: 0.75rem; }
@media (max-width: 767.98px) {
  .declare-layout { grid-template-columns: minmax(0, 1fr); }
}
</style>
