// The heavy, pure part of the relief (relief-height.mjs) off the main thread: a region's height
// field and the painting-over of what is built in 3D take ~1 s per million pixels — on the main
// thread that froze the page while the board loaded.
import { heightField, inpaint } from './relief-height.mjs';

self.onmessage = (e) => {
    const { id, op, a } = e.data;
    try {
        if (op === 'field') {
            const f = heightField(a.rgba, a.w, a.h, a.opt);
            self.postMessage({ id, out: f }, [f.buffer]);
        } else if (op === 'inpaint') {
            inpaint(a.px, a.w, a.h, a.mask, a.iters, { avoid: a.avoid });
            self.postMessage({ id, out: a.px }, [a.px.buffer]);
        }
    } catch (err) {
        self.postMessage({ id, error: String(err && err.stack || err) });
    }
};
