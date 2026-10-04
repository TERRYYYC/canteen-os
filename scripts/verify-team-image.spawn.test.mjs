import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// build-data.mjs runs this gate as a child process with the image on piped stdin
// (verifyRaster). verify-team-image.test.mjs calls the exported function in-process, so it
// cannot see failures that only exist in that spawned shape - on Node 22 a piped stdin made
// `await import('pngjs')` / `await import('jpeg-js')` resolve to an empty CJS namespace and
// every raster was reported as `asset-unavailable`.
const GATE=fileURLToPath(new URL('verify-team-image.mjs',import.meta.url));

// 2x2 truecolour PNG and 2x2 baseline JPEG, byte-identical to the fixtures in
// verify-team-image.test.mjs.
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGO0qdjCwMDAxAAGABCSAWwmSJZFAAAAAElFTkSuQmCC','base64');
const JPEG=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDx2iiiu04z/9k=','base64');

test('the gate decodes PNG and JPEG when it is spawned with the image on piped stdin',()=>{
 for(const [format,bytes] of [['png',PNG],['jpeg',JPEG]]) {
  const result=spawnSync(process.execPath,[GATE],{input:bytes,timeout:30000,maxBuffer:64*1024});
  assert.equal(result.status,0,`${format}: ${result.stderr}`);
  assert.deepEqual(JSON.parse(result.stdout.toString('utf8')),{format,width:2,height:2});
 }
});
