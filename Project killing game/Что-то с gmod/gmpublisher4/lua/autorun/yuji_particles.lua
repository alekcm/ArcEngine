AddCSLuaFile()

game.AddParticles("particles/minwool/jjk/jujutsu_kaisen.pcf")
game.AddParticles("particles/yuji/cursed_energy.pcf")
game.AddParticles("particles/yuji/blood_manipulation.pcf")
game.AddParticles("particles/yuji/shrine.pcf")


-- from shared
PrecacheParticleSystem("jjk_normal")
PrecacheParticleSystem("jjk_black_flash")
PrecacheParticleSystem("jjk_bf_trail")
PrecacheParticleSystem("jjk_bf_lightning")

-- from ce
PrecacheParticleSystem("ce_fist_energy")
PrecacheParticleSystem("ce_hit")
PrecacheParticleSystem("ce_simple_domain")
PrecacheParticleSystem("ce_surge")
PrecacheParticleSystem("ce_burst")

-- from bm
PrecacheParticleSystem("blood_hit")
PrecacheParticleSystem("blood_slice")
PrecacheParticleSystem("blood_spew")
PrecacheParticleSystem("piercing_blood_spew")
PrecacheParticleSystem("blood_explode")

-- from shrine
PrecacheParticleSystem("dismantle_slash")
PrecacheParticleSystem("cleave_slash")
PrecacheParticleSystem("dismantle_hit")
PrecacheParticleSystem("dismantle_slice")
