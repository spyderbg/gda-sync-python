<script lang="ts">
// Markdown text, such as Claude Code's report, drawn as Vue elements from parseMarkdown: its text stays text, so it
// cannot add markup. Its headings start at headingLevel, below the heading the text sits under.
import { computed, defineComponent, h, type VNode } from 'vue';
import { parseMarkdown, type Block, type Inline } from '../markdown';

function inline(content: Inline[]): (VNode | string)[] {
  return content.map((part) => {
    switch (part.kind) {
      case 'text': return part.text;
      case 'code': return h('code', part.text);
      case 'strong': return h('strong', inline(part.children));
      case 'em': return h('em', inline(part.children));
      case 'link': return h('a', { href: part.href, target: '_blank', rel: 'noopener noreferrer' }, inline(part.children));
    }
  });
}

function lines(content: Inline[][]): (VNode | string)[] {
  return content.flatMap((line, index) => (index ? [h('br'), ...inline(line)] : inline(line)));
}

export default defineComponent({
  name: 'MarkdownText',
  props: {
    text: { type: String, required: true },
    headingLevel: { type: Number, default: 4 },
  },
  setup(props) {
    const blocks = computed(() => parseMarkdown(props.text));

    function block(part: Block): VNode {
      switch (part.kind) {
        case 'heading': return h(`h${Math.min(6, props.headingLevel + part.level - 1)}`, { class: 'markdown-heading' }, inline(part.content));
        case 'paragraph': return h('p', lines(part.lines));
        case 'code': return h('pre', h('code', part.text));
        case 'quote': return h('blockquote', part.blocks.map(block));
        case 'rule': return h('hr');
        case 'list':
          return h(part.ordered ? 'ol' : 'ul', part.ordered && part.start !== 1 ? { start: part.start } : {}, part.items.map((item) =>
            // A list item's first paragraph sits on its marker's line, as in a list without blank lines between items.
            h('li', item.flatMap((child, index) => (index === 0 && child.kind === 'paragraph' ? lines(child.lines) : [block(child)])))));
        case 'table':
          return h('div', { class: 'markdown-table' }, h('table', { class: 'table table-sm' }, [
            h('thead', h('tr', part.header.map((cell) => h('th', inline(cell))))),
            h('tbody', part.rows.map((row) => h('tr', row.map((cell) => h('td', inline(cell)))))),
          ]));
      }
    }

    return () => h('div', { class: 'markdown-text' }, blocks.value.map(block));
  },
});
</script>

<style scoped>
.markdown-text { overflow-wrap: anywhere; }
.markdown-text > :last-child { margin-bottom: 0; }
.markdown-text :deep(p), .markdown-text :deep(ul), .markdown-text :deep(ol), .markdown-text :deep(pre), .markdown-text :deep(blockquote) { margin-bottom: 0.75rem; }
.markdown-text :deep(.markdown-heading) { margin: 1rem 0 0.5rem; font-size: 0.95rem; font-weight: 700; }
.markdown-text :deep(.markdown-heading:first-child) { margin-top: 0; }
.markdown-text :deep(ul), .markdown-text :deep(ol) { padding-left: 1.5rem; }
.markdown-text :deep(li > ul), .markdown-text :deep(li > ol), .markdown-text :deep(li > p) { margin: 0.25rem 0 0; }
.markdown-text :deep(pre) { padding: 0.75rem; border-radius: 6px; background: #f5f6fa; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
.markdown-text :deep(code) { overflow-wrap: anywhere; }
.markdown-text :deep(blockquote) { padding-left: 0.75rem; border-left: 3px solid #dee2e6; color: #6c757d; }
.markdown-text :deep(.markdown-table) { overflow-x: auto; margin-bottom: 0.75rem; }
.markdown-text :deep(.markdown-table table) { margin-bottom: 0; }
</style>
