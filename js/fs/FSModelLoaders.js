// FSModelLoaders.js — patches Babylon's OBJ loader for mixed UV/non-UV faces
// and adds a native SceneLoader plugin for Unity AssetBundles (.unity3d).

const FSModelLoaders = (() => {
    const UNITY_COMMON_STRINGS =
        'AABB\0AnimationClip\0AnimationCurve\0AnimationState\0Array\0Base\0BitField\0' +
        'bitset\0bool\0char\0ColorRGBA\0Component\0data\0deque\0double\0dynamic_array\0' +
        'FastPropertyName\0first\0float\0Font\0GameObject\0Generic Mono\0GradientNEW\0' +
        'GUID\0GUIStyle\0int\0list\0long long\0map\0Matrix4x4f\0MdFour\0MonoBehaviour\0' +
        'MonoScript\0m_ByteSize\0m_Curve\0m_EditorClassIdentifier\0m_EditorHideFlags\0' +
        'm_Enabled\0m_ExtensionPtr\0m_GameObject\0m_Index\0m_IsArray\0m_IsStatic\0' +
        'm_MetaFlag\0m_Name\0m_ObjectHideFlags\0m_PrefabInternal\0m_PrefabParentObject\0' +
        'm_Script\0m_StaticEditorFlags\0m_Type\0m_Version\0Object\0pair\0PPtr<Component>\0' +
        'PPtr<GameObject>\0PPtr<Material>\0PPtr<MonoBehaviour>\0PPtr<MonoScript>\0' +
        'PPtr<Object>\0PPtr<Prefab>\0PPtr<Sprite>\0PPtr<TextAsset>\0PPtr<Texture>\0' +
        'PPtr<Texture2D>\0PPtr<Transform>\0Prefab\0Quaternionf\0Rectf\0RectInt\0RectOffset\0' +
        'second\0set\0short\0size\0SInt16\0SInt32\0SInt64\0SInt8\0staticvector\0string\0' +
        'TextAsset\0TextMesh\0Texture\0Texture2D\0Transform\0TypelessData\0UInt16\0UInt32\0' +
        'UInt64\0UInt8\0unsigned int\0unsigned long long\0unsigned short\0vector\0Vector2f\0' +
        'Vector3f\0Vector4f\0m_ScriptingClassIdentifier\0Gradient\0Type*\0int2_storage\0' +
        'int3_storage\0BoundsInt\0m_CorrespondingSourceObject\0m_PrefabInstance\0m_PrefabAsset\0' +
        'FileSize\0Hash128\0';

    /**
     * Babylon's OBJ parser throws in `_unwrapData` when an OBJ file has `vt`
     * coordinates for most faces but also includes bare `f v1 v2 v3` faces or
     * `l v1 v2` edges without UV indices (`_wrappedUvsForBabylon` ends up
     * shorter than `_wrappedPositionForBabylon`). Normalize those lines so
     * every mesh in Warhammer/ imports cleanly.
     * @param {string} str
     * @returns {string}
     */
    function sanitizeObjText(str) {
        if (!str || !/^[ \t]*vt\b/m.test(str)) return str;
        return str
            .replace(/^[ \t]*l[ \t][^\r\n]*$/gm, '')
            .replace(/^([ \t]*f\b[^\r\n]*)$/gm, line =>
                line.indexOf('/') >= 0 ? line : line.replace(/\b(\d+)\b/g, '$1/1'));
    }

    /**
     * Raw LZ4 block decompressor (used by UnityFS block info headers and blocks).
     * @param {Uint8Array} src
     * @param {number} outSize
     * @returns {Uint8Array}
     */
    function lz4Decompress(src, outSize) {
        const out = new Uint8Array(outSize);
        let i = 0, o = 0;
        while (i < src.length && o < outSize) {
            const token = src[i++];
            let litLen = token >>> 4;
            if (litLen === 15) {
                let b;
                do { b = src[i++]; litLen += b; } while (b === 255 && i < src.length);
            }
            out.set(src.subarray(i, i + litLen), o);
            i += litLen;
            o += litLen;
            if (i >= src.length || o >= outSize) break;
            const offset = src[i] | (src[i + 1] << 8);
            i += 2;
            let matchLen = (token & 15) + 4;
            if ((token & 15) === 15) {
                let b;
                do { b = src[i++]; matchLen += b; } while (b === 255 && i < src.length);
            }
            let m = o - offset;
            const end = Math.min(outSize, o + matchLen);
            while (o < end) out[o++] = out[m++];
        }
        return out;
    }

    /**
     * LZMA1 stream decompressor for UnityFS blocks (5-byte props header, known output size).
     * @param {Uint8Array} src
     * @param {number} outSize
     * @returns {Uint8Array}
     */
    function lzmaDecompress(src, outSize) {
        const prop = src[0];
        const lc = prop % 9, rem = (prop / 9) | 0, lp = rem % 5, pb = (rem / 5) | 0;
        let pos = 5;
        let range = 0xffffffff >>> 0, code = 0;
        for (let i = 0; i < 5; i++) code = ((code << 8) | (src[pos++] || 0)) >>> 0;
        const norm = () => {
            if (range < 0x01000000) {
                range = (range << 8) >>> 0;
                code = ((code << 8) | (src[pos++] || 0)) >>> 0;
            }
        };
        const decodeBit = (probs, idx) => {
            const p = probs[idx];
            const bound = ((range >>> 11) * p) >>> 0;
            if (code < bound) {
                range = bound;
                probs[idx] = p + ((2048 - p) >>> 5);
                norm();
                return 0;
            }
            range = (range - bound) >>> 0;
            code = (code - bound) >>> 0;
            probs[idx] = p - (p >>> 5);
            norm();
            return 1;
        };
        const decodeTree = (probs, base, numBits) => {
            let m = 1;
            for (let i = 0; i < numBits; i++) m = (m << 1) | decodeBit(probs, base + m);
            return m - (1 << numBits);
        };
        const decodeReverseTree = (probs, base, numBits) => {
            let m = 1, sym = 0;
            for (let i = 0; i < numBits; i++) {
                const bit = decodeBit(probs, base + m);
                m = (m << 1) | bit;
                sym |= bit << i;
            }
            return sym;
        };
        const decodeDirect = numBits => {
            let res = 0;
            for (let i = numBits; i > 0; i--) {
                range >>>= 1;
                code = (code - range) >>> 0;
                const t = 0 - (code >>> 31);
                code = (code + (range & t)) >>> 0;
                norm();
                res = (res << 1) | (t + 1);
            }
            return res;
        };
        const makeProbs = n => { const a = new Uint16Array(n); a.fill(1024); return a; };
        const isMatch = makeProbs(12 << pb), isRep = makeProbs(12), isRepG0 = makeProbs(12),
            isRepG1 = makeProbs(12), isRepG2 = makeProbs(12), isRep0Long = makeProbs(12 << pb);
        const posSlot = makeProbs(4 * 64), posDec = makeProbs(115), align = makeProbs(16);
        const litProbs = makeProbs(0x300 << (lc + lp));
        const makeLen = () => ({ choice: makeProbs(2), low: makeProbs(16 << 3), mid: makeProbs(16 << 3), high: makeProbs(256) });
        const lenDec = makeLen(), repLenDec = makeLen();
        const decodeLen = (d, posState) => {
            if (decodeBit(d.choice, 0) === 0) return decodeTree(d.low, posState << 3, 3);
            if (decodeBit(d.choice, 1) === 0) return 8 + decodeTree(d.mid, posState << 3, 3);
            return 16 + decodeTree(d.high, 0, 8);
        };

        const out = new Uint8Array(outSize);
        let outPos = 0, state = 0, rep0 = 0, rep1 = 0, rep2 = 0, rep3 = 0;
        const posStateMask = (1 << pb) - 1, lpMask = (1 << lp) - 1;

        while (outPos < outSize) {
            const posState = outPos & posStateMask;
            if (decodeBit(isMatch, (state << pb) + posState) === 0) {
                const prevByte = outPos > 0 ? out[outPos - 1] : 0;
                const litState = ((outPos & lpMask) << lc) + (prevByte >>> (8 - lc));
                const base = 0x300 * litState;
                let sym = 1;
                if (state >= 7) {
                    let matchByte = out[outPos - rep0 - 1];
                    do {
                        const matchBit = (matchByte >>> 7) & 1;
                        matchByte <<= 1;
                        const bit = decodeBit(litProbs, base + ((1 + matchBit) << 8) + sym);
                        sym = (sym << 1) | bit;
                        if (matchBit !== bit) break;
                    } while (sym < 0x100);
                }
                while (sym < 0x100) sym = (sym << 1) | decodeBit(litProbs, base + sym);
                out[outPos++] = sym & 0xff;
                state = state < 4 ? 0 : (state < 10 ? state - 3 : state - 6);
            } else {
                let len;
                if (decodeBit(isRep, state) === 1) {
                    if (decodeBit(isRepG0, state) === 0) {
                        if (decodeBit(isRep0Long, (state << pb) + posState) === 0) {
                            state = state < 7 ? 9 : 11;
                            out[outPos] = out[outPos - rep0 - 1];
                            outPos++;
                            continue;
                        }
                    } else {
                        let dist;
                        if (decodeBit(isRepG1, state) === 0) dist = rep1;
                        else {
                            if (decodeBit(isRepG2, state) === 0) dist = rep2;
                            else { dist = rep3; rep3 = rep2; }
                            rep2 = rep1;
                        }
                        rep1 = rep0;
                        rep0 = dist;
                    }
                    len = decodeLen(repLenDec, posState) + 2;
                    state = state < 7 ? 8 : 11;
                } else {
                    rep3 = rep2; rep2 = rep1; rep1 = rep0;
                    len = decodeLen(lenDec, posState) + 2;
                    state = state < 7 ? 7 : 10;
                    const slot = decodeTree(posSlot, (len - 2 < 4 ? len - 2 : 3) << 6, 6);
                    if (slot >= 4) {
                        const numDirect = (slot >>> 1) - 1;
                        rep0 = (2 | (slot & 1)) << numDirect;
                        if (slot < 14) rep0 += decodeReverseTree(posDec, rep0 - slot, numDirect);
                        else {
                            rep0 += decodeDirect(numDirect - 4) << 4;
                            rep0 += decodeReverseTree(align, 0, 4);
                        }
                    } else rep0 = slot;
                }
                let m = outPos - rep0 - 1;
                const end = Math.min(outSize, outPos + len);
                while (outPos < end) out[outPos++] = out[m++];
            }
        }
        return out;
    }

    function float16ToFloat32(h) {
        const s = (h & 0x8000) >> 15;
        const e = (h & 0x7c00) >> 10;
        const f = h & 0x03ff;
        if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
        if (e === 0x1f) return f ? NaN : (s ? -Infinity : Infinity);
        return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
    }

    function decodeUtf8(bytes) {
        if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
        let s = '';
        for (let i = 0; i < bytes.length;) {
            const b0 = bytes[i++];
            if (b0 < 0x80) s += String.fromCharCode(b0);
            else if (b0 < 0xe0) s += String.fromCharCode(((b0 & 0x1f) << 6) | (bytes[i++] & 0x3f));
            else if (b0 < 0xf0) s += String.fromCharCode(((b0 & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
            else {
                const cp = (((b0 & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f)) - 0x10000;
                s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
            }
        }
        return s;
    }

    function readCStr(bytes, pos) {
        let end = pos;
        while (end < bytes.length && bytes[end] !== 0) end++;
        const str = decodeUtf8(bytes.subarray(pos, end));
        return { str, pos: end + 1 };
    }

    function commonStr(offset) {
        const end = UNITY_COMMON_STRINGS.indexOf('\0', offset);
        return end < 0 ? UNITY_COMMON_STRINGS.slice(offset) : UNITY_COMMON_STRINGS.slice(offset, end);
    }

    function readU64BE(dv, pos) {
        return dv.getUint32(pos, false) * 4294967296 + dv.getUint32(pos + 4, false);
    }

    function readI64Key(dv, pos, le) {
        const lo = dv.getUint32(pos + (le ? 0 : 4), le);
        const hi = dv.getInt32(pos + (le ? 4 : 0), le);
        return hi + ':' + lo;
    }

    function decompressBlock(slice, uSize, mode) {
        if (mode === 0) return slice;
        if (mode === 1) return lzmaDecompress(slice, uSize);
        if (mode === 2 || mode === 3) return lz4Decompress(slice, uSize);
        throw new Error('UnityFS: неизвестный метод сжатия ' + mode);
    }

    function rotateByQuat(q, x, y, z) {
        const tx = 2 * (q.y * z - q.z * y);
        const ty = 2 * (q.z * x - q.x * z);
        const tz = 2 * (q.x * y - q.y * x);
        return {
            x: x + q.w * tx + (q.y * tz - q.z * ty),
            y: y + q.w * ty + (q.z * tx - q.x * tz),
            z: z + q.w * tz + (q.x * ty - q.y * tx),
        };
    }

    /**
     * Extract all MeshFilter meshes from a UnityFS `.unity3d` AssetBundle buffer.
     * @param {ArrayBuffer | Uint8Array} input
     */
    function parseUnityBundle(input) {
        const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let r = readCStr(bytes, 0);
        if (r.str !== 'UnityFS') throw new Error('Не архив UnityFS: ' + r.str);
        let pos = r.pos;
        const formatVer = dv.getUint32(pos, false); pos += 4;
        r = readCStr(bytes, pos); pos = r.pos;
        r = readCStr(bytes, pos); pos = r.pos;
        const bundleSize = readU64BE(dv, pos); pos += 8;
        const cBlocksInfo = dv.getUint32(pos, false); pos += 4;
        const uBlocksInfo = dv.getUint32(pos, false); pos += 4;
        const flags = dv.getUint32(pos, false); pos += 4;
        if (formatVer >= 7) pos = (pos + 15) & ~15;

        let blocksInfoSlice;
        if (flags & 0x80) {
            blocksInfoSlice = bytes.subarray(bundleSize - cBlocksInfo, bundleSize);
        } else {
            blocksInfoSlice = bytes.subarray(pos, pos + cBlocksInfo);
            pos += cBlocksInfo;
        }
        if (flags & 0x200) pos = (pos + 15) & ~15;

        const bi = decompressBlock(blocksInfoSlice, uBlocksInfo, flags & 0x3f);
        const biDv = new DataView(bi.buffer, bi.byteOffset, bi.byteLength);
        let bp = 16; // uncompressedDataHash
        const blockCount = biDv.getUint32(bp, false); bp += 4;
        const blocks = [];
        let totalSize = 0;
        for (let i = 0; i < blockCount; i++) {
            const uSz = biDv.getUint32(bp, false);
            const cSz = biDv.getUint32(bp + 4, false);
            const bFlags = biDv.getUint16(bp + 8, false);
            bp += 10;
            blocks.push({ uSz, cSz, bFlags });
            totalSize += uSz;
        }
        const nodeCount = biDv.getUint32(bp, false); bp += 4;
        const files = new Map();
        const nodeList = [];
        for (let i = 0; i < nodeCount; i++) {
            const nOff = readU64BE(biDv, bp);
            const nSz = readU64BE(biDv, bp + 8);
            const nFlags = biDv.getUint32(bp + 16, false);
            bp += 20;
            const nr = readCStr(bi, bp); bp = nr.pos;
            nodeList.push({ offset: nOff, size: nSz, flags: nFlags, name: nr.str });
        }

        const stream = new Uint8Array(totalSize);
        let sOut = 0;
        for (const blk of blocks) {
            const chunk = bytes.subarray(pos, pos + blk.cSz);
            pos += blk.cSz;
            const dec = decompressBlock(chunk, blk.uSz, blk.bFlags & 0x3f);
            stream.set(dec, sOut);
            sOut += blk.uSz;
        }
        for (const nd of nodeList) {
            files.set(nd.name, stream.subarray(nd.offset, nd.offset + nd.size));
        }

        const cabEntry = nodeList.find(n => !/\.(resS|resource)$/i.test(n.name));
        if (!cabEntry) throw new Error('В UnityFS нет сериализованного файла');
        const cab = files.get(cabEntry.name);
        return parseSerializedMeshes(cab, files);
    }

    function parseSerializedMeshes(cab, files) {
        const dv = new DataView(cab.buffer, cab.byteOffset, cab.byteLength);
        let p = 0;
        let metaSize = dv.getUint32(0, false);
        let sfVer = dv.getUint32(8, false);
        let dataOffset = dv.getUint32(12, false);
        let endian = cab[16];
        if (sfVer >= 22) {
            endian = cab[4];
            metaSize = dv.getUint32(20, false);
            dataOffset = readU64BE(dv, 32);
            p = 48;
        } else {
            p = 20;
        }
        const le = endian === 0;
        const vr = readCStr(cab, p); p = vr.pos;
        p += 4; // targetPlatform
        const enableTypeTree = cab[p++] !== 0;
        const typeCount = dv.getInt32(p, le); p += 4;

        const nodeSize = sfVer >= 19 ? 32 : 24;
        const types = [];
        for (let ti = 0; ti < typeCount; ti++) {
            const classId = dv.getInt32(p, le); p += 4;
            if (sfVer >= 16) p += 1; // isStrippedType
            if (sfVer >= 17) p += 2; // scriptTypeIndex
            if (classId === 114 || classId < 0) p += 16;
            p += 16; // oldTypeHash
            let tree = null;
            if (enableTypeTree) {
                const nodeCnt = dv.getInt32(p, le);
                const strBufSz = dv.getInt32(p + 4, le);
                p += 8;
                const nodeStart = p;
                p += nodeCnt * nodeSize;
                const strBuf = cab.subarray(p, p + strBufSz);
                p += strBufSz;
                if (sfVer >= 21) {
                    const depCnt = dv.getInt32(p, le); p += 4 + depCnt * 4;
                }
                const rawNodes = [];
                for (let ni = 0; ni < nodeCnt; ni++) {
                    const np = nodeStart + ni * nodeSize;
                    const lvl = cab[np + 2];
                    const tflags = cab[np + 3];
                    const tOff = dv.getUint32(np + 4, le);
                    const nOff = dv.getUint32(np + 8, le);
                    const bsz = dv.getInt32(np + 12, le);
                    const mflag = dv.getInt32(np + 20, le);
                    const getStr = off => (off & 0x80000000) ? commonStr(off & 0x7fffffff) : readCStr(strBuf, off).str;
                    rawNodes.push({ lvl, tflags, type: getStr(tOff), name: getStr(nOff), size: bsz, align: (mflag & 0x4000) !== 0, children: [] });
                }
                const stack = [];
                for (const nd of rawNodes) {
                    while (stack.length && stack[stack.length - 1].lvl >= nd.lvl) stack.pop();
                    if (stack.length) stack[stack.length - 1].children.push(nd);
                    else tree = nd;
                    stack.push(nd);
                }
            }
            types.push({ classId, tree });
        }

        const readNode = (pos, nd) => {
            const t = nd.type, ch = nd.children;
            let val;
            if (t === 'string') {
                const arr = ch[0];
                const ln = dv.getInt32(pos, le); pos += 4;
                val = decodeUtf8(cab.subarray(pos, pos + ln));
                pos += ln;
                if ((arr && arr.align) || nd.align) pos = (pos + 3) & ~3;
                return { val, pos };
            }
            if (t === 'TypelessData') {
                const ln = dv.getInt32(pos, le); pos += 4;
                val = cab.subarray(pos, pos + ln);
                pos += ln;
                if (nd.align) pos = (pos + 3) & ~3;
                return { val, pos };
            }
            if (ch.length && (ch[0].tflags & 1)) {
                const arr = ch[0];
                const elem = arr.children[1];
                const ln = dv.getInt32(pos, le); pos += 4;
                if (!elem.children.length && (elem.type === 'UInt8' || elem.type === 'SInt8' || elem.type === 'char')) {
                    val = cab.subarray(pos, pos + ln);
                    pos += ln;
                } else {
                    val = [];
                    for (let i = 0; i < ln; i++) {
                        const er = readNode(pos, elem);
                        val.push(er.val);
                        pos = er.pos;
                    }
                }
                if (arr.align || nd.align) pos = (pos + 3) & ~3;
                return { val, pos };
            }
            if (!ch.length) {
                if (t === 'bool') { val = cab[pos] !== 0; pos += 1; }
                else if (t === 'SInt8') { val = dv.getInt8(pos); pos += 1; }
                else if (t === 'UInt8' || t === 'char') { val = cab[pos]; pos += 1; }
                else if (t === 'SInt16' || t === 'short') { val = dv.getInt16(pos, le); pos += 2; }
                else if (t === 'UInt16' || t === 'unsigned short') { val = dv.getUint16(pos, le); pos += 2; }
                else if (t === 'SInt32' || t === 'int' || t === 'Type*') { val = dv.getInt32(pos, le); pos += 4; }
                else if (t === 'UInt32' || t === 'unsigned int') { val = dv.getUint32(pos, le); pos += 4; }
                else if (t === 'SInt64' || t === 'long long') { val = readI64Key(dv, pos, le); pos += 8; }
                else if (t === 'UInt64' || t === 'unsigned long long' || t === 'FileSize') { val = readI64Key(dv, pos, le); pos += 8; }
                else if (t === 'float') { val = dv.getFloat32(pos, le); pos += 4; }
                else if (t === 'double') { val = dv.getFloat64(pos, le); pos += 8; }
                if (nd.align) pos = (pos + 3) & ~3;
                return { val, pos };
            }
            val = {};
            for (const c of ch) {
                const cr = readNode(pos, c);
                val[c.name] = cr.val;
                pos = cr.pos;
            }
            if (nd.align) pos = (pos + 3) & ~3;
            return { val, pos };
        };

        const objCount = dv.getInt32(p, le); p += 4;
        const objects = new Map();
        for (let oi = 0; oi < objCount; oi++) {
            if (sfVer >= 14) p = (p + 3) & ~3;
            const pathId = readI64Key(dv, p, le); p += 8;
            const byteStart = sfVer >= 22 ? readU64BE(dv, p) : dv.getUint32(p, le);
            p += sfVer >= 22 ? 8 : 4;
            const byteSize = dv.getUint32(p, le); p += 4;
            const typeId = dv.getInt32(p, le); p += 4;
            const tp = types[typeId];
            if (tp && tp.tree && (tp.classId === 1 || tp.classId === 4 || tp.classId === 33 || tp.classId === 43)) {
                objects.set(pathId, { classId: tp.classId, data: readNode(dataOffset + byteStart, tp.tree).val, byteSize });
            }
        }

        const transformsByGo = new Map();
        const transformsById = new Map();
        for (const [pid, entry] of objects) {
            if (entry.classId === 4) {
                transformsById.set(pid, entry.data);
                if (entry.data.m_GameObject) transformsByGo.set(entry.data.m_GameObject.m_PathID, { id: pid, tf: entry.data });
            }
        }

        const readChannelFloat = (vDv, base, fmt) => {
            if (fmt === 0) return vDv.getFloat32(base, le);
            if (fmt === 1) return float16ToFloat32(vDv.getUint16(base, le));
            if (fmt === 2) return vDv.getUint8(base) / 255;
            if (fmt === 3) return Math.max(-1, vDv.getInt8(base) / 127);
            return 0;
        };
        const fmtBytes = fmt => (fmt === 0 ? 4 : fmt === 1 ? 2 : 1);

        const outMeshes = [];
        const meshFilters = [...objects.values()].filter(e => e.classId === 33);
        const buildGeometry = (meshObj, tfChain) => {
            const vData = meshObj.m_VertexData || {};
            const vCount = vData.m_VertexCount || 0;
            if (!vCount) return null;
            let rawVerts = vData.m_DataSize;
            const streamInfo = meshObj.m_StreamData;
            if ((!rawVerts || !rawVerts.length) && streamInfo && streamInfo.size > 0) {
                const spath = String(streamInfo.path || '');
                const tail = spath.split('/').pop();
                const resBuf = files.get(tail) || files.get(spath);
                if (resBuf) rawVerts = resBuf.subarray(streamInfo.offset, streamInfo.offset + streamInfo.size);
            }
            if (!rawVerts || !rawVerts.length) return null;

            const channels = vData.m_Channels || [];
            const posCh = channels[0];
            if (!posCh || !(posCh.dimension & 0xf)) return null;
            const normCh = channels[1] && (channels[1].dimension & 0xf) ? channels[1] : null;
            const uvCh = (channels[4] && (channels[4].dimension & 0xf) ? channels[4] : null)
                || (channels[3] && (channels[3].dimension & 0xf) ? channels[3] : null);

            // Compute per-stream vertex strides from channel offsets + element sizes.
            const streamStrides = [0, 0, 0, 0];
            for (const ch of channels) {
                const dim = ch.dimension & 0xf;
                if (!dim) continue;
                const end = ch.offset + dim * fmtBytes(ch.format);
                if (end > streamStrides[ch.stream || 0]) streamStrides[ch.stream || 0] = end;
            }
            const streamOffsets = [0, 0, 0, 0];
            for (let s = 1; s < 4; s++) {
                const prevBytes = streamStrides[s - 1] * vCount;
                streamOffsets[s] = ((streamOffsets[s - 1] + prevBytes + 15) & ~15);
            }
            if (!streamStrides[0]) streamStrides[0] = Math.floor(rawVerts.length / vCount);

            const vDv = new DataView(rawVerts.buffer, rawVerts.byteOffset, rawVerts.byteLength);
            const positions = new Float32Array(vCount * 3);
            const normals = normCh ? new Float32Array(vCount * 3) : null;
            const uvs = uvCh ? new Float32Array(vCount * 2) : null;

            for (let i = 0; i < vCount; i++) {
                const pBase = streamOffsets[posCh.stream || 0] + i * streamStrides[posCh.stream || 0] + posCh.offset;
                const pf = fmtBytes(posCh.format);
                let px = readChannelFloat(vDv, pBase, posCh.format);
                let py = readChannelFloat(vDv, pBase + pf, posCh.format);
                let pz = readChannelFloat(vDv, pBase + pf * 2, posCh.format);

                let nx = 0, ny = 1, nz = 0;
                if (normCh && normals) {
                    const nBase = streamOffsets[normCh.stream || 0] + i * streamStrides[normCh.stream || 0] + normCh.offset;
                    const nf = fmtBytes(normCh.format);
                    nx = readChannelFloat(vDv, nBase, normCh.format);
                    ny = readChannelFloat(vDv, nBase + nf, normCh.format);
                    nz = readChannelFloat(vDv, nBase + nf * 2, normCh.format);
                }

                for (const tf of tfChain) {
                    const sc = tf.m_LocalScale || { x: 1, y: 1, z: 1 };
                    const rt = tf.m_LocalRotation || { x: 0, y: 0, z: 0, w: 1 };
                    const tr = tf.m_LocalPosition || { x: 0, y: 0, z: 0 };
                    const rp = rotateByQuat(rt, px * sc.x, py * sc.y, pz * sc.z);
                    px = rp.x + tr.x; py = rp.y + tr.y; pz = rp.z + tr.z;
                    if (normals) {
                        const rn = rotateByQuat(rt,
                            sc.x ? nx / sc.x : nx,
                            sc.y ? ny / sc.y : ny,
                            sc.z ? nz / sc.z : nz);
                        nx = rn.x; ny = rn.y; nz = rn.z;
                    }
                }

                // Unity uses left-handed coordinates; flip X into right-handed Babylon space.
                positions[i * 3] = -px;
                positions[i * 3 + 1] = py;
                positions[i * 3 + 2] = pz;
                if (normals) {
                    const len = Math.hypot(nx, ny, nz) || 1;
                    normals[i * 3] = -nx / len;
                    normals[i * 3 + 1] = ny / len;
                    normals[i * 3 + 2] = nz / len;
                }
                if (uvCh && uvs) {
                    const uBase = streamOffsets[uvCh.stream || 0] + i * streamStrides[uvCh.stream || 0] + uvCh.offset;
                    const uf = fmtBytes(uvCh.format);
                    uvs[i * 2] = readChannelFloat(vDv, uBase, uvCh.format);
                    uvs[i * 2 + 1] = readChannelFloat(vDv, uBase + uf, uvCh.format);
                }
            }

            const idxBuf = meshObj.m_IndexBuffer;
            if (!idxBuf || !idxBuf.length) return null;
            const iDv = new DataView(idxBuf.buffer, idxBuf.byteOffset, idxBuf.byteLength);
            const is32 = meshObj.m_IndexFormat === 1;
            const idxStep = is32 ? 4 : 2;
            const indices = [];
            const subMeshes = meshObj.m_SubMeshes && meshObj.m_SubMeshes.length
                ? meshObj.m_SubMeshes
                : [{ firstByte: 0, indexCount: Math.floor(idxBuf.length / idxStep), topology: 0, baseVertex: 0 }];
            for (const sm of subMeshes) {
                if (sm.topology && sm.topology !== 0) continue;
                const baseV = sm.baseVertex || 0;
                for (let t = 0; t + 2 < sm.indexCount; t += 3) {
                    const off = sm.firstByte + t * idxStep;
                    const i0 = baseV + (is32 ? iDv.getUint32(off, le) : iDv.getUint16(off, le));
                    const i1 = baseV + (is32 ? iDv.getUint32(off + idxStep, le) : iDv.getUint16(off + idxStep, le));
                    const i2 = baseV + (is32 ? iDv.getUint32(off + idxStep * 2, le) : iDv.getUint16(off + idxStep * 2, le));
                    // X flip inverts triangle handedness; Babylon right-handed scenes expect CCW.
                    indices.push(i0, i1, i2);
                }
            }
            if (!indices.length) return null;
            return { name: meshObj.m_Name || 'unity-mesh', positions, normals, uvs, indices };
        };

        if (meshFilters.length) {
            for (const mfEntry of meshFilters) {
                const mf = mfEntry.data;
                const meshEntry = mf.m_Mesh && objects.get(mf.m_Mesh.m_PathID);
                if (!meshEntry || meshEntry.classId !== 43) continue;
                // Walk transforms up to (but excluding) the root prefab node so
                // child scale/rotation/offset compose properly without root table offset.
                const chain = [];
                let curTf = mf.m_GameObject && transformsByGo.get(mf.m_GameObject.m_PathID);
                let cur = curTf ? curTf.tf : null;
                while (cur) {
                    const parentId = cur.m_Father && cur.m_Father.m_PathID;
                    const parent = (parentId && parentId !== '0:0') ? transformsById.get(parentId) : null;
                    if (!parent) break; // stop before root prefab world offset
                    chain.push(cur);
                    cur = parent;
                }
                const geom = buildGeometry(meshEntry.data, chain);
                if (geom) outMeshes.push(geom);
            }
        } else {
            for (const entry of objects.values()) {
                if (entry.classId !== 43) continue;
                const geom = buildGeometry(entry.data, []);
                if (geom) outMeshes.push(geom);
            }
        }
        return outMeshes;
    }

    function createBabylonMeshes(scene, parsed) {
        const meshes = [];
        for (const g of parsed) {
            const mesh = new BABYLON.Mesh('fs-unity-' + g.name, scene);
            const vd = new BABYLON.VertexData();
            vd.positions = g.positions;
            vd.indices = g.indices;
            if (g.normals) vd.normals = g.normals;
            else {
                const norms = [];
                BABYLON.VertexData.ComputeNormals(g.positions, g.indices, norms);
                vd.normals = norms;
            }
            if (g.uvs) vd.uvs = g.uvs;
            vd.applyToMesh(mesh);
            meshes.push(mesh);
        }
        return meshes;
    }

    let objPatched = false;
    let u3dRegistered = false;
    function register() {
        if (typeof BABYLON === 'undefined' || !BABYLON.SceneLoader) return;
        const loader = /** @type {any} */ (BABYLON.SceneLoader);
        if (!objPatched && typeof loader.GetPluginForExtension === 'function') {
            const objPlugin = loader.GetPluginForExtension('.obj');
            if (objPlugin && objPlugin.name === 'obj') {
                const proto = Object.getPrototypeOf(objPlugin);
                if (proto && typeof proto._decode === 'function' && !proto._fsSanitized) {
                    const origDecode = proto._decode;
                    proto._decode = function (data) {
                        return sanitizeObjText(origDecode.call(this, data));
                    };
                    proto._fsSanitized = true;
                }
                objPatched = true;
            }
        }
        if (!u3dRegistered && typeof loader.RegisterPlugin === 'function') {
            loader.RegisterPlugin({
                name: 'unity3d',
                extensions: { '.unity3d': { isBinary: true } },
                importMeshAsync(meshesNames, scene, data) {
                    return Promise.resolve().then(() => {
                        const parsed = parseUnityBundle(data);
                        const meshes = createBabylonMeshes(scene, parsed);
                        return {
                            meshes,
                            particleSystems: [],
                            skeletons: [],
                            animationGroups: [],
                            transformNodes: [],
                            geometries: [],
                            lights: [],
                            spriteManagers: [],
                        };
                    });
                },
                loadAsync(scene, data) {
                    return this.importMeshAsync(null, scene, data).then(() => {});
                },
                loadAssetContainerAsync(scene, data) {
                    return this.importMeshAsync(null, scene, data).then(res => {
                        const container = new BABYLON.AssetContainer(scene);
                        for (const m of res.meshes) container.meshes.push(m);
                        return container;
                    });
                },
            });
            u3dRegistered = true;
        }
    }

    register();
    return { register, sanitizeObjText, parseUnityBundle, createBabylonMeshes };
})();
