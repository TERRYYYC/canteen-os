import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {describeDecoderFailure} from './build-data.mjs';

// #101: verifyRaster ran the decoder in a child and dropped its stderr, so every failure
// surfaced as a bare `Same-revision image is unavailable: <path>`. The real cause
// (`PNG is not a constructor` on Node 22) was invisible. Assert against a real
// execFileSync rejection, not a hand-built object, so the error shape stays covered.
const failing=(code)=>{
 try {execFileSync(process.execPath,['-e',code],{stdio:['pipe','pipe','pipe']});}
 catch (error) {return error;}
 throw new Error('child unexpectedly succeeded');
};

test('the decoder child failure keeps the first stderr line',()=>{
 const detail=describeDecoderFailure(failing('process.stderr.write("Image decode failed: PNG is not a constructor\\nstack line\\n");process.exit(1)'));
 assert.equal(detail,'Image decode failed: PNG is not a constructor');
});

test('a silent non-zero exit still names the exit code, and the line stays bounded',()=>{
 assert.equal(describeDecoderFailure(failing('process.exit(3)')),'decoder exited with code 3');
 assert.equal(describeDecoderFailure({stderr:'x'.repeat(500)}).length,200);
 assert.equal(describeDecoderFailure({code:'ETIMEDOUT'}),'decoder timed out');
 assert.equal(describeDecoderFailure(undefined),'decoder failed');
});
