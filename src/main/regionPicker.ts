import { BrowserWindow, nativeImage, screen as electronScreen } from 'electron';
import screenshot from 'screenshot-desktop';
import type { WindowInfo } from '../shared/workflow';

export type PickedRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  relativeTo: 'target' | 'screen';
};
export type PickedPoint = { x: number; y: number };

type PickerMode = 'point' | 'region';
type CapturePreview = {
  dataUrl: string;
  image: Electron.NativeImage;
  bounds: Electron.Rectangle;
  relativeTo: 'target' | 'screen';
};

type ScreenshotDisplay = Awaited<ReturnType<typeof screenshot.listDisplays>>[number] & {
  left: number;
  top: number;
  width: number;
  height: number;
};

let pickerPromise: Promise<BrowserWindow> | undefined;

const pickerHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#05070c;font:13px sans-serif}
body{cursor:crosshair}.tip{position:fixed;top:8px;left:8px;padding:8px 10px;border:1px solid #475569;border-radius:6px;color:white;background:#111827e8}
.preview{position:fixed;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none}
.box{position:fixed;border:2px solid #38bdf8;background:#38bdf833;pointer-events:none}.cross{position:fixed;width:22px;height:22px;border:2px solid #7c8cff;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;box-shadow:0 0 0 1px #111827}
.cross:after{content:'';position:absolute;inset:8px;background:#fff;border-radius:50%}[hidden]{display:none!important}
</style></head><body><img class="preview"><div class="tip"></div><div class="box" hidden></div><div class="cross" hidden></div><script>
const preview=document.querySelector('.preview'),tip=document.querySelector('.tip'),box=document.querySelector('.box'),cross=document.querySelector('.cross');let mode='point',start;
window.setPickerMode=(next,image)=>{mode=next;preview.src=image;start=undefined;box.hidden=true;cross.hidden=true;tip.textContent=mode==='point'?'Click a location | Esc to cancel':'Drag to select | Esc to cancel';document.title='READY:'+mode+':'+Date.now()};
addEventListener('mousemove',e=>{if(mode==='point'){cross.hidden=false;cross.style.left=e.clientX+'px';cross.style.top=e.clientY+'px';return}if(!start)return;Object.assign(box.style,{left:Math.min(start.x,e.clientX)+'px',top:Math.min(start.y,e.clientY)+'px',width:Math.abs(e.clientX-start.x)+'px',height:Math.abs(e.clientY-start.y)+'px'})});
addEventListener('mousedown',e=>{if(mode!=='region')return;start={x:e.clientX,y:e.clientY};box.hidden=false});
addEventListener('mouseup',e=>{if(mode!=='region'||!start)return;const value={x:Math.round(Math.min(start.x,e.clientX)),y:Math.round(Math.min(start.y,e.clientY)),width:Math.max(1,Math.round(Math.abs(e.clientX-start.x))),height:Math.max(1,Math.round(Math.abs(e.clientY-start.y)))};document.title='REGION:'+JSON.stringify(value)});
addEventListener('click',e=>{if(mode==='point')document.title='POINT:'+JSON.stringify({x:Math.round(e.clientX),y:Math.round(e.clientY)})});
addEventListener('keydown',e=>{if(e.key==='Escape')document.title='CANCEL'});
</script></body></html>`;

async function createPicker(parent: BrowserWindow): Promise<BrowserWindow> {
  const picker = new BrowserWindow({
    parent,
    show: false,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  picker.on('closed', () => {
    pickerPromise = undefined;
  });
  await picker.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(pickerHtml)}`);
  return picker;
}

function getPicker(parent: BrowserWindow): Promise<BrowserWindow> {
  pickerPromise ??= createPicker(parent);
  return pickerPromise;
}

async function captureTarget(target: WindowInfo): Promise<CapturePreview> {
  const display = electronScreen.getDisplayMatching(target.bounds);
  const displays = (await screenshot.listDisplays()) as ScreenshotDisplay[];
  const matchingDisplay = findMatchingScreenshotDisplay(display, displays);
  if (!matchingDisplay)
    throw new Error('Could not capture a preview of the selected target window');

  const displayCapture = nativeImage.createFromBuffer(
    await screenshot({ format: 'png', screen: matchingDisplay.id }),
  );
  const captureSize = displayCapture.getSize();
  const scaleX = captureSize.width / matchingDisplay.width;
  const scaleY = captureSize.height / matchingDisplay.height;
  const cropX = Math.max(0, Math.round((target.bounds.x - display.bounds.x) * scaleX));
  const cropY = Math.max(0, Math.round((target.bounds.y - display.bounds.y) * scaleY));
  const cropWidth = Math.min(
    captureSize.width - cropX,
    Math.max(1, Math.round(target.bounds.width * scaleX)),
  );
  const cropHeight = Math.min(
    captureSize.height - cropY,
    Math.max(1, Math.round(target.bounds.height * scaleY)),
  );
  if (cropX < 0 || cropY < 0 || cropWidth <= 0 || cropHeight <= 0) {
    throw new Error('Could not capture a preview of the selected target window');
  }
  const image = displayCapture.crop({
    x: cropX,
    y: cropY,
    width: cropWidth,
    height: cropHeight,
  });
  return {
    dataUrl: image.toDataURL(),
    image,
    bounds: target.bounds,
    relativeTo: 'target',
  };
}

function findMatchingScreenshotDisplay(
  display: Electron.Display,
  displays: ScreenshotDisplay[],
): ScreenshotDisplay | undefined {
  return (
    displays.find(
      (candidate) =>
        candidate.left === display.bounds.x &&
        candidate.top === display.bounds.y &&
        candidate.width === display.bounds.width &&
        candidate.height === display.bounds.height,
    ) ??
    displays.find(
      (candidate) => candidate.left === display.bounds.x && candidate.top === display.bounds.y,
    )
  );
}

async function captureScreen(): Promise<CapturePreview> {
  const bounds = electronScreen
    .getAllDisplays()
    .map((display) => display.bounds)
    .reduce((current, next) => {
      const left = Math.min(current.x, next.x);
      const top = Math.min(current.y, next.y);
      const right = Math.max(current.x + current.width, next.x + next.width);
      const bottom = Math.max(current.y + current.height, next.y + next.height);
      return { x: left, y: top, width: right - left, height: bottom - top };
    });
  const image = nativeImage.createFromBuffer(await screenshot({ format: 'png' }));
  const size = image.getSize();
  const displayImage =
    size.width === bounds.width && size.height === bounds.height
      ? image
      : image.resize({ width: bounds.width, height: bounds.height });
  return {
    dataUrl: displayImage.toDataURL(),
    image: displayImage,
    bounds,
    relativeTo: 'screen',
  };
}

export function preparePicker(parent: BrowserWindow): void {
  void getPicker(parent).catch(() => {
    pickerPromise = undefined;
  });
}

async function showPicker<T>(
  parent: BrowserWindow,
  capture: CapturePreview,
  mode: PickerMode,
  parse: (title: string) => T | undefined,
): Promise<T | undefined> {
  const picker = await getPicker(parent);
  picker.setBounds(capture.bounds);
  await picker.webContents.executeJavaScript(
    `window.setPickerMode(${JSON.stringify(mode)},${JSON.stringify(capture.dataUrl)})`,
  );
  return new Promise((resolve) => {
    let done = false;
    const finish = (value?: T) => {
      if (done) return;
      done = true;
      picker.removeListener('page-title-updated', onTitle);
      if (!picker.isDestroyed()) picker.hide();
      resolve(value);
    };
    const onTitle = (event: Electron.Event, title: string) => {
      event.preventDefault();
      if (title === 'CANCEL') return finish();
      const value = parse(title);
      if (value !== undefined) finish(value);
    };
    picker.on('page-title-updated', onTitle);
    picker.once('hide', () => finish());
    picker.showInactive();
    picker.focus();
  });
}

function sampledColor(image: Electron.NativeImage, x: number, y: number): string {
  const pixel = image.crop({ x, y, width: 1, height: 1 }).toBitmap();
  return `#${pixel[2]!.toString(16).padStart(2, '0')}${pixel[1]!.toString(16).padStart(2, '0')}${pixel[0]!.toString(16).padStart(2, '0')}`;
}

export async function pickPoint(
  parent: BrowserWindow,
  target: WindowInfo,
): Promise<PickedPoint | undefined> {
  return showPicker(parent, await captureTarget(target), 'point', (title) => {
    if (!title.startsWith('POINT:')) return undefined;
    try {
      return JSON.parse(title.slice(6)) as PickedPoint;
    } catch {
      return undefined;
    }
  });
}

async function pickRegionFromCapture(
  parent: BrowserWindow,
  capture: CapturePreview,
): Promise<PickedRegion | undefined> {
  const region = await showPicker<Omit<PickedRegion, 'color' | 'relativeTo'>>(
    parent,
    capture,
    'region',
    (title) => {
      if (!title.startsWith('REGION:')) return undefined;
      try {
        return JSON.parse(title.slice(7)) as Omit<PickedRegion, 'color' | 'relativeTo'>;
      } catch {
        return undefined;
      }
    },
  );
  if (!region) return undefined;
  return {
    ...region,
    x: capture.relativeTo === 'screen' ? capture.bounds.x + region.x : region.x,
    y: capture.relativeTo === 'screen' ? capture.bounds.y + region.y : region.y,
    color: sampledColor(capture.image, region.x, region.y),
    relativeTo: capture.relativeTo,
  };
}

export async function pickRegion(
  parent: BrowserWindow,
  target: WindowInfo,
): Promise<PickedRegion | undefined> {
  return pickRegionFromCapture(parent, await captureTarget(target));
}

export async function pickScreenRegion(parent: BrowserWindow): Promise<PickedRegion | undefined> {
  return pickRegionFromCapture(parent, await captureScreen());
}
