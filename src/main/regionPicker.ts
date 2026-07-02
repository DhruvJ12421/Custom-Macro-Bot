import { BrowserWindow, nativeImage } from 'electron';
import screenshot from 'screenshot-desktop';
import type { WindowInfo } from '../shared/workflow';

export type PickedRegion = { x: number; y: number; width: number; height: number; color: string };

export async function pickRegion(
  parent: BrowserWindow,
  target: WindowInfo,
): Promise<PickedRegion | undefined> {
  const shot = nativeImage.createFromBuffer(await screenshot({ format: 'png' }));
  const targetImage = shot.crop(target.bounds);
  const picker = new BrowserWindow({
    parent,
    modal: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    x: target.bounds.x,
    y: target.bounds.y,
    width: target.bounds.width,
    height: target.bounds.height,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const html = `<!doctype html><style>*{box-sizing:border-box}body{margin:0;overflow:hidden;cursor:crosshair;background:#000}img{width:100vw;height:100vh;user-select:none}.box{position:fixed;border:2px solid #38bdf8;background:#38bdf833;pointer-events:none}.tip{position:fixed;top:8px;left:8px;background:#111827dd;color:white;padding:7px;font:13px sans-serif}</style><img draggable="false" src="${targetImage.toDataURL()}"><div class="tip">Drag to select · Esc to cancel</div><div class="box" hidden></div><script>const {ipcRenderer}=require('electron');</script>`;
  const safeHtml = html.replace(
    "<script>const {ipcRenderer}=require('electron');</script>",
    `<script>let start;const box=document.querySelector('.box');addEventListener('mousedown',e=>{start={x:e.clientX,y:e.clientY};box.hidden=false});addEventListener('mousemove',e=>{if(!start)return;Object.assign(box.style,{left:Math.min(start.x,e.clientX)+'px',top:Math.min(start.y,e.clientY)+'px',width:Math.abs(e.clientX-start.x)+'px',height:Math.abs(e.clientY-start.y)+'px'})});addEventListener('mouseup',e=>{if(!start)return;const r={x:Math.round(Math.min(start.x,e.clientX)),y:Math.round(Math.min(start.y,e.clientY)),width:Math.max(1,Math.round(Math.abs(e.clientX-start.x))),height:Math.max(1,Math.round(Math.abs(e.clientY-start.y)))};document.title='PICK:'+JSON.stringify(r)});addEventListener('keydown',e=>{if(e.key==='Escape')document.title='CANCEL'})</script>`,
  );
  await picker.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(safeHtml)}`);
  return new Promise((resolve) => {
    let done = false;
    const finish = (value?: PickedRegion) => {
      if (done) return;
      done = true;
      if (!picker.isDestroyed()) picker.close();
      resolve(value);
    };
    picker.on('page-title-updated', (event, title) => {
      event.preventDefault();
      if (title === 'CANCEL') return finish();
      if (!title.startsWith('PICK:')) return;
      try {
        const region = JSON.parse(title.slice(5)) as Omit<PickedRegion, 'color'>;
        const pixel = targetImage
          .crop({ x: region.x, y: region.y, width: 1, height: 1 })
          .toBitmap();
        const color = `#${pixel[2]!.toString(16).padStart(2, '0')}${pixel[1]!.toString(16).padStart(2, '0')}${pixel[0]!.toString(16).padStart(2, '0')}`;
        finish({ ...region, color });
      } catch {
        finish();
      }
    });
    picker.on('closed', () => finish());
    picker.focus();
  });
}
