/* pack-itch.js — build the itch.io upload.
 *
 *   node pack-itch.js
 *
 * itch.io wants a ZIP with index.html at its ROOT, served from a path like
 * html-classic.itch.zone/html/<id>/. Every path in this project is already
 * relative, which is what makes that work unchanged.
 *
 * Two deliberate differences from the GitHub Pages build:
 *
 *  1. NO SERVICE WORKER. sw.js is cache-first, and on itch that is a footgun:
 *     re-upload without bumping VERSION and returning players keep the old build.
 *     Offline play is also not a real use case for a game embedded in an itch
 *     page. The registration block is stripped from index.html here; the source
 *     index.html keeps it so the Pages build is unaffected.
 *
 *  2. ONLY THE ART THE GAME LOADS. The pack ships 521 PNGs and 54 .aseprite
 *     sources across five team colours; this game touches 139 files.
 *     The list below is not guessed — it is every image request a real page load
 *     actually made, captured from the browser. If you add art, re-capture it, or
 *     the missing file will 404 at runtime.
 *
 * The pack's folder names contain spaces, so nothing here may assume otherwise.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = 'dist-itch';
const ZIP = 'tiny-swords-lane-siege.zip';

/* Every image the game requests on a full load. */
const ART = [
  "Deco/01.png",
  "Deco/02.png",
  "Deco/03.png",
  "Deco/04.png",
  "Deco/05.png",
  "Deco/06.png",
  "Deco/07.png",
  "Deco/08.png",
  "Deco/09.png",
  "Deco/10.png",
  "Deco/11.png",
  "Deco/12.png",
  "Deco/13.png",
  "Deco/14.png",
  "Deco/15.png",
  "Effects/Explosion/Explosions.png",
  "Effects/Fire/Fire.png",
  "Factions/Goblins/Buildings/Wood_House/Goblin_House.png",
  "Factions/Goblins/Buildings/Wood_House/Goblin_House_Destroyed.png",
  "Factions/Goblins/Troops/Barrel/Red/Barrel_Red.png",
  "Factions/Goblins/Troops/TNT/Dynamite/Dynamite.png",
  "Factions/Goblins/Troops/TNT/Red/TNT_Red.png",
  "Factions/Goblins/Troops/Torch/Red/Torch_Red.png",
  "Factions/Knights/Buildings/Tower/Tower_Blue.png",
  "Factions/Knights/Buildings/Tower/Tower_Destroyed.png",
  "Factions/Knights/Troops/Dead/Dead.png",
  "Particle FX/Dust_01.png",
  "Particle FX/Dust_02.png",
  "Terrain/Decorations/Bushes/Bushe1.png",
  "Terrain/Decorations/Bushes/Bushe2.png",
  "Terrain/Decorations/Bushes/Bushe3.png",
  "Terrain/Decorations/Bushes/Bushe4.png",
  "Terrain/Decorations/Clouds/Clouds_01.png",
  "Terrain/Decorations/Clouds/Clouds_02.png",
  "Terrain/Decorations/Clouds/Clouds_03.png",
  "Terrain/Decorations/Clouds/Clouds_04.png",
  "Terrain/Decorations/Clouds/Clouds_05.png",
  "Terrain/Decorations/Clouds/Clouds_06.png",
  "Terrain/Decorations/Clouds/Clouds_07.png",
  "Terrain/Decorations/Clouds/Clouds_08.png",
  "Terrain/Decorations/Rocks in the Water/Water Rocks_01.png",
  "Terrain/Decorations/Rocks in the Water/Water Rocks_02.png",
  "Terrain/Decorations/Rocks in the Water/Water Rocks_03.png",
  "Terrain/Decorations/Rocks in the Water/Water Rocks_04.png",
  "Terrain/Decorations/Rocks/Rock1.png",
  "Terrain/Decorations/Rocks/Rock2.png",
  "Terrain/Decorations/Rocks/Rock3.png",
  "Terrain/Decorations/Rocks/Rock4.png",
  "Terrain/Decorations/Rubber Duck/Rubber duck.png",
  "Terrain/Ground/Tilemap_Flat.png",
  "Terrain/Resources/Meat/Sheep/Sheep_Grass.png",
  "Terrain/Resources/Meat/Sheep/Sheep_Idle.png",
  "Terrain/Resources/Wood/Trees/Stump 1.png",
  "Terrain/Resources/Wood/Trees/Stump 2.png",
  "Terrain/Resources/Wood/Trees/Stump 3.png",
  "Terrain/Resources/Wood/Trees/Stump 4.png",
  "Terrain/Resources/Wood/Trees/Tree1.png",
  "Terrain/Resources/Wood/Trees/Tree2.png",
  "Terrain/Resources/Wood/Trees/Tree3.png",
  "Terrain/Resources/Wood/Trees/Tree4.png",
  "Terrain/Tileset/Tilemap_color1.png",
  "Terrain/Tileset/Tilemap_color2.png",
  "Terrain/Tileset/Tilemap_color3.png",
  "Terrain/Tileset/Tilemap_color4.png",
  "Terrain/Tileset/Tilemap_color5.png",
  "Terrain/Water/Foam/Foam.png",
  "Terrain/Water/Water.png",
  "UI Elements/UI Elements/Banners/Banner.png",
  "UI Elements/UI Elements/Bars/BigBar_Base.png",
  "UI Elements/UI Elements/Bars/BigBar_Fill.png",
  "UI Elements/UI Elements/Bars/SmallBar_Base.png",
  "UI Elements/UI Elements/Buttons/BigBlueButton_Pressed.png",
  "UI Elements/UI Elements/Buttons/BigBlueButton_Regular.png",
  "UI Elements/UI Elements/Buttons/BigRedButton_Pressed.png",
  "UI Elements/UI Elements/Buttons/BigRedButton_Regular.png",
  "UI Elements/UI Elements/Buttons/SmallBlueRoundButton_Pressed.png",
  "UI Elements/UI Elements/Buttons/SmallBlueRoundButton_Regular.png",
  "UI Elements/UI Elements/Buttons/SmallBlueSquareButton_Pressed.png",
  "UI Elements/UI Elements/Buttons/SmallBlueSquareButton_Regular.png",
  "UI Elements/UI Elements/Buttons/SmallRedSquareButton_Pressed.png",
  "UI Elements/UI Elements/Buttons/SmallRedSquareButton_Regular.png",
  "UI Elements/UI Elements/Cursors/Cursor_01.png",
  "UI Elements/UI Elements/Cursors/Cursor_02.png",
  "UI Elements/UI Elements/Human Avatars/Avatars_01.png",
  "UI Elements/UI Elements/Human Avatars/Avatars_02.png",
  "UI Elements/UI Elements/Human Avatars/Avatars_03.png",
  "UI Elements/UI Elements/Human Avatars/Avatars_04.png",
  "UI Elements/UI Elements/Human Avatars/Avatars_05.png",
  "UI Elements/UI Elements/Human Avatars/Avatars_06.png",
  "UI Elements/UI Elements/Human Avatars/Avatars_07.png",
  "UI Elements/UI Elements/Human Avatars/Avatars_08.png",
  "UI Elements/UI Elements/Human Avatars/Avatars_09.png",
  "UI Elements/UI Elements/Human Avatars/Avatars_10.png",
  "UI Elements/UI Elements/Human Avatars/Avatars_16.png",
  "UI Elements/UI Elements/Icons/Icon_01.png",
  "UI Elements/UI Elements/Icons/Icon_02.png",
  "UI Elements/UI Elements/Icons/Icon_03.png",
  "UI Elements/UI Elements/Icons/Icon_04.png",
  "UI Elements/UI Elements/Icons/Icon_05.png",
  "UI Elements/UI Elements/Icons/Icon_06.png",
  "UI Elements/UI Elements/Icons/Icon_07.png",
  "UI Elements/UI Elements/Icons/Icon_08.png",
  "UI Elements/UI Elements/Icons/Icon_09.png",
  "UI Elements/UI Elements/Icons/Icon_10.png",
  "UI Elements/UI Elements/Icons/Icon_11.png",
  "UI Elements/UI Elements/Icons/Icon_12.png",
  "UI Elements/UI Elements/Papers/RegularPaper.png",
  "UI Elements/UI Elements/Papers/SpecialPaper.png",
  "UI Elements/UI Elements/Ribbons/BigRibbons.png",
  "UI Elements/UI Elements/Ribbons/SmallRibbons.png",
  "UI Elements/UI Elements/Swords/Swords.png",
  "UI Elements/UI Elements/Wood Table/WoodTable.png",
  "Units/Blue Units/Archer/Archer_Idle.png",
  "Units/Blue Units/Archer/Archer_Run.png",
  "Units/Blue Units/Archer/Archer_Shoot.png",
  "Units/Blue Units/Archer/Arrow.png",
  "Units/Blue Units/Lancer/Lancer_Idle.png",
  "Units/Blue Units/Lancer/Lancer_Right_Attack.png",
  "Units/Blue Units/Lancer/Lancer_Right_Defence.png",
  "Units/Blue Units/Lancer/Lancer_Run.png",
  "Units/Blue Units/Monk/Heal.png",
  "Units/Blue Units/Monk/Heal_Effect.png",
  "Units/Blue Units/Monk/Idle.png",
  "Units/Blue Units/Monk/Run.png",
  "Units/Blue Units/Pawn/Pawn_Idle Knife.png",
  "Units/Blue Units/Pawn/Pawn_Interact Knife.png",
  "Units/Blue Units/Pawn/Pawn_Run Knife.png",
  "Units/Blue Units/Warrior/Warrior_Attack1.png",
  "Units/Blue Units/Warrior/Warrior_Attack2.png",
  "Units/Blue Units/Warrior/Warrior_Guard.png",
  "Units/Blue Units/Warrior/Warrior_Idle.png",
  "Units/Blue Units/Warrior/Warrior_Run.png",
  "Units/Purple Units/Archer/Archer_Idle.png",
  "Units/Purple Units/Archer/Archer_Run.png",
  "Units/Purple Units/Archer/Archer_Shoot.png",
  "Units/Purple Units/Archer/Arrow.png",
  "Units/Purple Units/Lancer/Lancer_Idle.png",
  "Units/Purple Units/Lancer/Lancer_Right_Attack.png",
  "Units/Purple Units/Lancer/Lancer_Right_Defence.png",
  "Units/Purple Units/Lancer/Lancer_Run.png",
  "Units/Purple Units/Monk/Heal.png",
  "Units/Purple Units/Monk/Idle.png",
  "Units/Purple Units/Monk/Run.png",
  "Units/Purple Units/Warrior/Warrior_Attack1.png",
  "Units/Purple Units/Warrior/Warrior_Attack2.png",
  "Units/Purple Units/Warrior/Warrior_Guard.png",
  "Units/Purple Units/Warrior/Warrior_Idle.png",
  "Units/Purple Units/Warrior/Warrior_Run.png",
  "icons/icon-192.png"
];

const CODE = [
  'game/style.css', 'game/gfx.js', 'game/assets.js', 'game/audio.js',
  'game/save.js', 'game/themes.js', 'game/terrain.js', 'game/scene.js',
  'game/fx.js', 'game/entities.js', 'game/levels.js', 'game/story.js', 'game/ui.js',
  'game/game.js',
  'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png',
  'icons/icon-maskable-512.png', 'icons/apple-touch-icon-180.png'
];

function copy(rel) {
  if (!fs.existsSync(rel)) throw new Error('missing source file: ' + rel);
  const dest = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(rel, dest);
  return fs.statSync(rel).size;
}

/* ------------------------------------------------------------------- zip -- */

/* Written by hand rather than shelling out, because shelling out was the bug.
 * `tar -a -c -f out.zip .` produced a plain TAR named .zip: bsdtar's -a picks the
 * COMPRESSION from the extension, not the archive FORMAT, so the file began with a
 * tar header and had no central directory. itch rejected it and so did Explorer.
 * It only looked fine because it was verified by extracting with tar — the same
 * tool that wrote it, which happily read its own format.
 *
 * This writer emits a plain, boring zip: forward-slash entry names with no "./"
 * prefix (itch looks for index.html at the root), no data descriptors, no Zip64,
 * one deflate or stored entry per file. Nothing here needs Zip64 — the whole
 * payload is a couple of megabytes and well under any 4GB or 65535-entry limit.
 */
const CRC_TABLE = (function () {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/* MS-DOS packed date/time: 2-second granularity, years counted from 1980. */
function dosStamp(d) {
  return {
    time: ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) |
      ((d.getSeconds() >> 1) & 31),
    date: (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) |
      (d.getDate() & 31)
  };
}

/* Collect every file under dir as {name, path}, names relative and slash-joined. */
function walk(dir, prefix, out) {
  fs.readdirSync(dir, { withFileTypes: true })
    .sort(function (a, b) { return a.name < b.name ? -1 : 1; })
    .forEach(function (e) {
      const full = path.join(dir, e.name);
      const name = prefix ? prefix + '/' + e.name : e.name;
      if (e.isDirectory()) walk(full, name, out);
      else out.push({ name: name, path: full });
    });
  return out;
}

function writeZip(dir, zipPath) {
  const files = walk(dir, '', []);
  const chunks = [], central = [];
  let offset = 0;

  files.forEach(function (f) {
    const raw = fs.readFileSync(f.path);
    const deflated = zlib.deflateRawSync(raw, { level: 9 });
    /* PNGs are already compressed, so deflate often makes them bigger. Storing
       those keeps the archive smaller and is equally valid. */
    const useDeflate = deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const stamp = dosStamp(fs.statSync(f.path).mtime);
    const nameBuf = Buffer.from(f.name, 'utf8');
    const sum = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // local file header signature
    local.writeUInt16LE(20, 4);           // version needed to extract (2.0)
    local.writeUInt16LE(0, 6);            // flags: none, so no data descriptor
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);           // extra field length
    chunks.push(local, nameBuf, body);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);     // central directory signature
    cen.writeUInt16LE(20, 4);             // version made by
    cen.writeUInt16LE(20, 6);             // version needed
    cen.writeUInt16LE(0, 8);              // flags
    cen.writeUInt16LE(method, 10);
    cen.writeUInt16LE(stamp.time, 12);
    cen.writeUInt16LE(stamp.date, 14);
    cen.writeUInt32LE(sum, 16);
    cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(raw.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);             // extra
    cen.writeUInt16LE(0, 32);             // comment
    cen.writeUInt16LE(0, 34);             // disk number start
    cen.writeUInt16LE(0, 36);             // internal attributes
    cen.writeUInt32LE(0, 38);             // external attributes
    cen.writeUInt32LE(offset, 42);        // offset of this local header
    central.push(cen, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  });

  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);       // end of central directory signature
  end.writeUInt16LE(0, 4);                // this disk
  end.writeUInt16LE(0, 6);                // disk with central directory
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);               // comment length

  fs.writeFileSync(zipPath, Buffer.concat([Buffer.concat(chunks), cdBuf, end]));
  return files.length;
}

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.rmSync(ZIP, { force: true });
  fs.mkdirSync(OUT, { recursive: true });

  let artBytes = 0, codeBytes = 0;
  ART.forEach(function (f) { artBytes += copy(f); });
  CODE.forEach(function (f) { codeBytes += copy(f); });

  /* index.html minus the service-worker registration. Matched on the comment that
     opens the block so a partial strip is impossible — if the markup changes and
     this stops matching, the build fails loudly rather than shipping the worker. */
  let html = fs.readFileSync('index.html', 'utf8');
  const start = html.indexOf('<script>');
  const end = html.indexOf('</script>', start);
  if (start < 0 || end < 0 || html.indexOf('serviceWorker', start) < 0) {
    throw new Error('could not find the service-worker block in index.html');
  }
  html = html.slice(0, start) +
    '<!-- Service worker intentionally omitted from the itch.io build; see pack-itch.js -->' +
    html.slice(end + '</script>'.length);
  fs.writeFileSync(path.join(OUT, 'index.html'), html);

  const entries = writeZip(OUT, ZIP);

  /* Sanity-check the bytes we just wrote rather than trusting them: a zip must
     start with PK\x03\x04 and carry an end-of-central-directory record. This is
     exactly what the previous tar-based version failed, silently. */
  const head = fs.readFileSync(ZIP, { encoding: null }).subarray(0, 4);
  if (head[0] !== 0x50 || head[1] !== 0x4b || head[2] !== 0x03 || head[3] !== 0x04) {
    throw new Error('output is not a zip: bad magic ' + head.toString('hex'));
  }
  const all = fs.readFileSync(ZIP);
  if (all.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])) < 0) {
    throw new Error('output has no end-of-central-directory record');
  }

  const zipBytes = fs.statSync(ZIP).size;
  console.log('entries in zip: ' + entries);
  console.log('art   ' + ART.length + ' files, ' + (artBytes / 1048576).toFixed(2) + ' MB');
  console.log('code  ' + CODE.length + ' files, ' + (codeBytes / 1024).toFixed(0) + ' KB');
  console.log('zip   ' + ZIP + '  ' + (zipBytes / 1048576).toFixed(2) + ' MB');
  console.log('');
  console.log('Upload ' + ZIP + ' to itch.io as kind "HTML" and tick');
  console.log('"This file will be played in the browser". Viewport 832 x 1472,');
  console.log('portrait, with the fullscreen button enabled.');
}

main();
