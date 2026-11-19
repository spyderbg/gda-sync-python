// Browser integration fixture: exercise the same resource, font, image and RTF renderer used by Play.
import type { GameProject } from '../src/game/app/GameBackend';
import { Runtime } from '../src/game/engine/GameCore/RuntimeAccess';
import { IResources } from '../src/game/engine/Game/RuntimeExport/IResources';
import { Clock } from '../src/game/engine/Game/Utils/Clock';
import { DrawList } from '../src/game/engine/GameVideoCtrl/DrawList';
import { ResourceManager } from '../src/game/engine/ResourceManager/ResourceManager';
import { VideoManager } from '../src/game/engine/VideoManager/VideoManager';
import { RtfElement, FigureKeyString } from '../src/game/engine/GameVideoCtrl/ViewElements/RtfElement';

export async function create(project: GameProject) {
  const resources = new ResourceManager(project, null);
  const runtime = new Runtime();
  runtime.Add(IResources, resources);
  const canvas = document.createElement('canvas');
  document.body.replaceChildren(canvas);
  const video = new VideoManager(canvas);
  video.Init(runtime, { systemFonts: [{ name: 'Test', dir: '../common/fonts', refSize: 120,
    mapping: { regular: { type: 'Regular', face: 'Regular' }, bold: { type: 'Bold', face: 'Bold' }, black: { type: 'Bold', face: 'Black' } } }] });
  const rtf = new RtfElement();
  rtf.Init(runtime, 'rtf_common_default');
  const layout = await resources.LoadRtfLayout(resources.GetRtf('rtf_common_default')!.file);
  rtf.Load();
  while (!rtf.IsLoaded()) await new Promise(requestAnimationFrame);
  rtf.SetPaytableTexts(new Map([[FigureKeyString({ name: 'bell', count: 3, multiplier: 1 }), '5,00']]));
  const images = video.GetImages();
  await images.Preload([...layout.pages.flatMap(page => page.background ? [page.background] : []),
    ...Object.values(layout.videos ?? {}).flatMap(video => video.frames)]);
  // Keep frame selection deterministic without waiting on wall time.
  let time = 0;
  Clock.now = () => time;
  const ctx = canvas.getContext('2d')!;
  const text: { value: string; font: string }[] = [];
  const fillText = ctx.fillText.bind(ctx);
  ctx.fillText = (value, x, y) => { text.push({ value, font: ctx.font }); fillText(value, x, y); };
  const draw = new DrawList(ctx);
  function render(at: number) {
    time = at;
    text.length = 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    rtf.DrawPage('wintable', draw);
    return { text: [...text], pixel: [...ctx.getImageData(960, 550, 1, 1).data] };
  }
  render(0);
  await Promise.resolve(); // Complete the already-preloaded video's start time.
  return {
    render,
    async fonts() {
      await document.fonts.ready;
      // FontFace.load handlers populate FontCache after the font set settles.
      await Promise.resolve();
      return ['Regular', 'Bold', 'Black'].map(face => video.GetFonts().SystemFamily(face));
    },
    title() { text.length = 0; rtf.DrawPage('rules', draw); return [...text]; },
  };
}
