const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { FFMPEG_PATH } = require('../server/pipeline/ffmpeg');

const sfxDirs = [
  path.join(__dirname, '..', 'public', 'sfx'),
  path.join(__dirname, '..', 'assets', 'sfx')
];

for (const dir of sfxDirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const sfxDefs = [
  {
    name: 'braam.wav',
    filter: 'sine=f=48:d=2.5[s1];sine=f=96:d=2.5,volume=0.35[s2];[s1][s2]amix=inputs=2,lowpass=f=160,afade=t=in:ss=0:d=0.04,afade=t=out:st=0.4:d=2.1,volume=3.5'
  },
  {
    name: 'whoosh.wav',
    filter: 'anoisesrc=d=0.85:c=pink:r=44100,bandpass=f=450:w=350,afade=t=in:ss=0:d=0.3,afade=t=out:st=0.3:d=0.55,volume=2.2'
  },
  {
    name: 'shutter.wav',
    filter: 'anoisesrc=d=0.2:c=white:r=44100,highpass=f=2500,afade=t=out:st=0.03:d=0.17,volume=2.0'
  },
  {
    name: 'marker.wav',
    filter: 'anoisesrc=d=0.7:c=pink:r=44100,bandpass=f=1400:w=500,afade=t=in:ss=0:d=0.05,afade=t=out:st=0.5:d=0.2,volume=1.8'
  },
  {
    name: 'paper.wav',
    filter: 'anoisesrc=d=0.35:c=brown:r=44100,bandpass=f=320:w=200,afade=t=in:ss=0:d=0.02,afade=t=out:st=0.06:d=0.29,volume=2.5'
  }
];

for (const def of sfxDefs) {
  for (const dir of sfxDirs) {
    const outPath = path.join(dir, def.name);
    console.log(`Generating ${def.name} -> ${outPath}...`);
    execFileSync(FFMPEG_PATH, [
      '-y',
      '-f', 'lavfi',
      '-i', def.filter,
      '-ar', '44100',
      '-ac', '2',
      outPath
    ], { stdio: 'pipe' });
  }
}

console.log('All 5 documentary SFX stems generated successfully!');
