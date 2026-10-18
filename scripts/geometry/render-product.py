"""Local Blender geometry/material proof. No network, AI provider, or production dispatch.
Usage: blender -b -t 2 --python scripts/geometry/render-product.py -- input.json output-directory
Input dimensions are millimetres. Material/thickness/flaps are explicit illustrative assumptions.
"""
import bpy, json, math, sys, pathlib, hashlib
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
args=sys.argv[sys.argv.index('--')+1:]; cfg=json.loads(pathlib.Path(args[0]).read_text());out=pathlib.Path(args[1]);out.mkdir(parents=True,exist_ok=True)
shape=cfg['shape'];assert shape in ['open-carton','cylinder'];w=float(cfg['widthMm'])/1000;d=float(cfg.get('depthMm',cfg['widthMm']))/1000;h=float(cfg['heightMm'])/1000
assert all(math.isfinite(v) and 0<v<=100 for v in [w,d,h])
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=96;scene.cycles.use_denoising=False;scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.filepath=str(out/'product.png');scene.view_settings.view_transform='AgX'
scene.world.color=(.08,.08,.08)
mat=bpy.data.materials.new('Reference-inspired material, not recovered print');mat.use_nodes=True;n=mat.node_tree.nodes;l=mat.node_tree.links;bs=n.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.42,.24,.105,1) if shape=='open-carton' else (.18,.28,.32,1);bs.inputs['Roughness'].default_value=.72 if shape=='open-carton' else .3
noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=850;noise.inputs['Detail'].default_value=3;bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.18;bump.inputs['Distance'].default_value=.0006;l.new(noise.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs['Normal'],bs.inputs['Normal'])
def cube(name,loc,size):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat);bevel=o.modifiers.new('Submillimetre edge highlight','BEVEL');bevel.width=min(w,d,h)*.002;bevel.segments=3;o.modifiers.new('Weighted face normals','WEIGHTED_NORMAL');return o
th=min(w,d,h)*.009
if shape=='open-carton':
 cube('Body bottom',(w/2,d/2,th/2),(w,d,th));cube('Body front',(w/2,th/2,h/2),(w,th,h));cube('Body back',(w/2,d-th/2,h/2),(w,th,h));cube('Body left',(th/2,d/2,h/2),(th,d,h));cube('Body right',(w-th/2,d/2,h/2),(th,d,h))
 angle=math.radians(35);c=math.cos(angle);s=math.sin(angle)
 faces=[[(0,0,h),(w,0,h),(w,-d*.45*c,h+d*.45*s),(0,-d*.45*c,h+d*.45*s)],[(0,d,h),(w,d,h),(w,d+d*.45*c,h+d*.45*s),(0,d+d*.45*c,h+d*.45*s)],[(0,0,h),(0,d,h),(-w*.45*c,d,h+w*.45*s),(-w*.45*c,0,h+w*.45*s)],[(w,0,h),(w,d,h),(w+w*.45*c,d,h+w*.45*s),(w+w*.45*c,0,h+w*.45*s)]]
 for i,pts in enumerate(faces):
  mesh=bpy.data.meshes.new('flap');mesh.from_pydata(pts,[],[(0,1,2,3)]);mesh.update();obj=bpy.data.objects.new('Illustrative flap '+str(i),mesh);scene.collection.objects.link(obj);obj.data.materials.append(mat);solid=obj.modifiers.new('Illustrative board thickness','SOLIDIFY');solid.thickness=th;solid.offset=-1;bev=obj.modifiers.new('Flap edges','BEVEL');bev.width=th*.18;bev.segments=3
 axes={'width':[(0,0,0),(w,0,0)],'depth':[(w,0,0),(w,d,0)],'height':[(w,d,0),(w,d,h)]}
else:
 bpy.ops.mesh.primitive_cylinder_add(vertices=128,radius=w/2,depth=h,location=(w/2,d/2,h/2));o=bpy.context.object;o.data.materials.append(mat);bev=o.modifiers.new('Rim bevel','BEVEL');bev.width=min(w,h)*.015;bev.segments=4;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');axes={'diameter':[(0,d/2,0),(w,d/2,0)],'height':[(w,d/2,0),(w,d/2,h)]}
# A transparent shadow catcher supports later composition without re-generating the product.
bpy.ops.mesh.primitive_plane_add(size=max(w,d,h)*200,location=(w/2,d/2,-th*.4));bpy.context.object.is_shadow_catcher=True
focus=Vector((w/2,d/2,h*.65));radius=max(w,d,h)
def light(name,loc,energy,size):
 data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size;o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(focus-o.location).to_track_quat('-Z','Y').to_euler()
light('Large soft key',(w*.1,-d*2,h+radius*2),22,radius*2);light('Rim softbox',(w+radius,d+radius,h+radius*1.8),14,radius*1.5);light('Front fill',(-radius,d*.1,h+radius),5,radius*2)
data=bpy.data.cameras.new('Fixed dimension camera');camera=bpy.data.objects.new('Fixed dimension camera',data);scene.collection.objects.link(camera);camera.location=focus+Vector((radius*2,-radius*2,radius*1.6));camera.rotation_euler=(focus-camera.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=radius*2.65;scene.camera=camera
bpy.context.view_layer.update();projected={k:[[float(q.x),float(1-q.y)] for q in [world_to_camera_view(scene,camera,Vector(pt)) for pt in pts]] for k,pts in axes.items()}
bpy.ops.wm.save_as_mainfile(filepath=str(out/'product.blend'));bpy.ops.render.render(write_still=True)
manifest={'version':1,'kind':'local-physically-based-proof','shape':shape,'bodyMm':{'width':w*1000,'depth':d*1000,'height':h*1000},'bodyHeightExcludesFlaps':True,'axes':projected,'projection':'orthographic','materialRecoveredFromPhoto':False,'printRecovered':False,'assumptions':{'boardThicknessMm':th*1000,'flapAngleDegrees':35,'flapFraction':.45},'sha256':hashlib.sha256((out/'product.png').read_bytes()).hexdigest(),'width':900,'height':900}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2));print('LOCAL_RENDER_COMPLETE',manifest['sha256'])
