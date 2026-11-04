// Original user-supplied miniatures. Loaded lazily; procedural figures remain as a fallback.
export const MODEL_SOURCES = {
  "metagorger": {
    "obj": "/Nemesis/dlc/Карноморфы/Глодатель/5D40483050EBCF4FD26F59BE65D28BB88F04D038_httpcloud3steamusercontentcomugc17614516147823090715D40483050EBCF4FD26F59BE65D28BB88F04D038.obj",
    "texture": "/Nemesis/dlc/Карноморфы/Глодатель/098333C75817053AEF4B5F20980E4EC9F318C4BE_httpcloud3steamusercontentcomugc1761451614782363663098333C75817053AEF4B5F20980E4EC9F318C4BE.jpg",
    "height": 1.2
  },
  "shambler": {
    "obj": "/Nemesis/dlc/Карноморфы/Падальщик/927469B60108F0DD7C1431A3AE3D44BB0B9A394E_httpcloud3steamusercontentcomugc1761451614782314585927469B60108F0DD7C1431A3AE3D44BB0B9A394E.obj",
    "texture": "/Nemesis/dlc/Карноморфы/Падальщик/DF6707069315BC0042159CAD81CA8386462A094D_httpcloud3steamusercontentcomugc1761451614782358687DF6707069315BC0042159CAD81CA8386462A094D.jpg",
    "height": 2.1
  },
  "breeder": {
    "obj": "/Nemesis/dlc/Карноморфы/Свежеватель/1E4D805CB57DAB0B2F37F8FF672D7644B3277F0D_carnoimorph breeder.obj",
    "texture": "/Nemesis/dlc/Карноморфы/Свежеватель/3EDBAF3F488E01372FC283BE71AEA48D9BF31F4F_httpcloud3steamusercontentcomugc17614516147823577053EDBAF3F488E01372FC283BE71AEA48D9BF31F4F.jpg",
    "height": 2.7
  },
  "butcher": {
    "obj": "/Nemesis/dlc/Карноморфы/Мясник/582A05A0050812962E58B74779737AA0351E5A1D_Butcher.obj",
    "texture": "/Nemesis/dlc/Карноморфы/Мясник/81A6BD4AF411F5AD1B2E58F3BBA1AC951319F2E0_Butcher.jpg",
    "height": 3.3
  },
  "lurker": {
    "obj": "/Nemesis/dlc/Кошмары/Таящийся/28756BE470B7D3F9B4F5471D1D8268DB420FBFA4_Lurker.obj",
    "texture": "/Nemesis/dlc/Кошмары/Таящийся/67B0F9648FA51291F3F67BB80CFAD148357037AC_httpcloud3steamusercontentcomugc176145169647877312967B0F9648FA51291F3F67BB80CFAD148357037AC.jpg",
    "height": 1.45
  },
  "whisperer": {
    "obj": "/Nemesis/dlc/Кошмары/Шепчущий/72E82CE52C6D729232E86CECDD39904D1921F970_httpcloud3steamusercontentcomugc176145161478233367372E82CE52C6D729232E86CECDD39904D1921F970.obj",
    "texture": "/Nemesis/dlc/Кошмары/Шепчущий/4DA2CD7B054298AF7E8B4D852941486FA1A70D6D_httpcloud3steamusercontentcomugc17614516147825197474DA2CD7B054298AF7E8B4D852941486FA1A70D6D.jpg",
    "height": 2
  },
  "creeper": {
    "obj": "/Nemesis/dlc/Кошмары/Крадущийся/20F8AD431E60C1D7FD58F8115C3F022D1CD6FE23_Hanger.obj",
    "texture": "/Nemesis/dlc/Кошмары/Крадущийся/BCFD33664A7E5B0869F921338A9B87994089E5DD_httpcloud3steamusercontentcomugc1761451614782511090BCFD33664A7E5B0869F921338A9B87994089E5DD.jpg",
    "height": 2.4
  },
  "despoiler": {
    "obj": "/Nemesis/dlc/Кошмары/Гнетущий/1DF8DE77C50C2EE6D018EC7A3855F239842FB4F2_httpcloud3steamusercontentcomugc17614516147823323351DF8DE77C50C2EE6D018EC7A3855F239842FB4F2.obj",
    "texture": "/Nemesis/dlc/Кошмары/Гнетущий/AE567AD1B921807BA6B11D2D7FB3315E683DF0EF_Despoiler.jpg",
    "height": 3.2
  },
  "lair": {
    "obj": "/Nemesis/dlc/Кошмары/Логово/B67363034B6AEC7E0A422F5D984928ACDEED938A_httpcloud3steamusercontentcomugc1761451614782351139B67363034B6AEC7E0A422F5D984928ACDEED938A.obj",
    "texture": "/Nemesis/dlc/Кошмары/Логово/F72CCA114E28D6D5BA87DD6013F1943CB5008012_httpcloud3steamusercontentcomugc1761451614782393408F72CCA114E28D6D5BA87DD6013F1943CB5008012.jpg",
    "height": 1.4
  }
};
Object.assign(MODEL_SOURCES, {
    stinkhorn: { obj:'/client/art/chytrids/models/stinkhorn.obj', bump:'/client/art/chytrids/models/stinkhorn-normal.jpg', height:1.7 },
    deathcap: { obj:'/client/art/chytrids/models/deathcap.obj', bump:'/client/art/chytrids/models/deathcap-normal.jpg', height:2.2 },
    chyQueen: { obj:'/client/art/chytrids/models/chyQueen.obj', bump:'/client/art/chytrids/models/chyQueen-normal.jpg', height:3.0 },
});
const cache = new Map();
/** Parse the OBJ subset used by these supplied meshes, retaining independent UV/normal seams.
 * Babylon textures already use invertY, so OBJ V coordinates must not be flipped a second time. */
export function parseObj(text, height = 2) {
    const verts=[], uv=[], normals=[], positions=[], uvs=[], norms=[], indices=[], seen=new Map();
    let min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity], completeNormals=true;
    const index=(s,n)=> { const i=Number(s); if(!Number.isInteger(i)||i===0) throw new Error('Invalid OBJ index'); return i<0?n+i:i-1; };
    for(const line of text.split(/\r?\n/)) {
        const parts=line.trim().split(/\s+/), tag=parts[0];
        if(tag==='v' && parts.length>=4) { const p=parts.slice(1,4).map(Number); if(p.some(x=>!Number.isFinite(x)))throw new Error('Invalid OBJ vertex'); verts.push(p); for(let j=0;j<3;j++){min[j]=Math.min(min[j],p[j]);max[j]=Math.max(max[j],p[j]);} }
        else if(tag==='vt' && parts.length>=3) uv.push(parts.slice(1,3).map(Number));
        else if(tag==='vn' && parts.length>=4) normals.push(parts.slice(1,4).map(Number));
        else if(tag==='f' && parts.length>=4) {
            const face=[];
            for(const token of parts.slice(1)) {
                const v=token.split('/'), vi=index(v[0],verts.length), ti=v[1] ? index(v[1],uv.length) : -1, ni=v[2] ? index(v[2],normals.length) : -1;
                const key=vi+'/'+ti+'/'+ni;
                if(!seen.has(key)) {
                    const point=verts[vi]; if(!point)throw new Error('OBJ vertex outside range');
                    positions.push(...point); const tex=ti>=0 ? uv[ti] : null; uvs.push(...(tex ? [tex[0],tex[1]] : [0,0]));
                    const normal=ni>=0 ? normals[ni] : null; norms.push(...(normal||[0,0,0])); if(!normal)completeNormals=false;
                    seen.set(key,positions.length/3-1);
                }
                face.push(seen.get(key));
            }
            for(let i=1;i<face.length-1;i++)indices.push(face[0],face[i],face[i+1]);
        }
    }
    if(!positions.length || !indices.length || !(max[1]>min[1]))throw new Error('Empty OBJ');
    const scale=height/(max[1]-min[1]), cx=(min[0]+max[0])/2, cz=(min[2]+max[2])/2;
    for(let i=0;i<positions.length;i+=3) { positions[i]=(positions[i]-cx)*scale; positions[i+1]=(positions[i+1]-min[1])*scale; positions[i+2]=(positions[i+2]-cz)*scale; }
    return {positions, uvs, normals: completeNormals ? norms : null, indices};
}
export function loadOriginalModel(type) {
    const source=MODEL_SOURCES[type]; if(!source || typeof window==='undefined' || typeof window.fetch!=='function')return null;
    if(!cache.has(type)) {
        const promise=window.fetch(encodeURI(source.obj)).then(r=>{if(!r.ok)throw new Error('OBJ HTTP '+r.status);return r.text();}).then(text=>parseObj(text,source.height)).catch(()=>null);
        cache.set(type,promise);
    }
    return cache.get(type);
}
const materials=new WeakMap();
export function originalModelMesh(scene, type, data) {
    const B=window.BABYLON, source=MODEL_SOURCES[type], mesh=new B.Mesh('original_'+type,scene), vd=new B.VertexData();
    vd.positions=data.positions; vd.uvs=data.uvs; vd.indices=data.indices;
    if(data.normals) vd.normals=data.normals; else {vd.normals=[];B.VertexData.ComputeNormals(vd.positions,vd.indices,vd.normals);}
    vd.applyToMesh(mesh);
    let perScene=materials.get(scene);if(!perScene){perScene=new Map();materials.set(scene,perScene);}
    let mat=perScene.get(type);
    if(!mat){mat=new B.StandardMaterial('originalMaterial_'+type,scene);if(source.texture)mat.diffuseTexture=new B.Texture(encodeURI(source.texture),scene);
        if(source.bump)mat.bumpTexture=new B.Texture(encodeURI(source.bump),scene);
        if(!source.texture)mat.diffuseColor=new B.Color3(.58,.64,.48);
        mat.backFaceCulling=false;mat.specularColor=new B.Color3(.18,.18,.18);perScene.set(type,mat);}
    mesh.material=mat;return mesh;
}
