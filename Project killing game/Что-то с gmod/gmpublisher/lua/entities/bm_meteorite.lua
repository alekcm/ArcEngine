AddCSLuaFile()

ENT.Base = "base_anim"
ENT.Type = "anim"

ENT.speed = -2000
ENT.got = false
-- wow minwool uses a separate script for an entity (rare)
if CLIENT then
    killicon.Add("bm_meteorite", "bloodmanipulation/chibi", Color(255, 255, 255))
end

function ENT:Initialize()
    self:SetModel("models/bloodmanipulation/bm_meteorite.mdl") 
    self:SetMaterial("bloodmanipulation/effects/bloodystream")
    self:PhysicsInit(SOLID_VPHYSICS)
    self:SetMoveType(MOVETYPE_VPHYSICS)
    self:SetSolid(SOLID_VPHYSICS)
    self:SetColor(Color(153, 16, 43))
    self:SetModelScale(0.2)
    self:Activate()
    self:SetNWBool("barrier", true)
    self:DrawShadow(false)
    self:EmitSound("bloodmanipulation/falling_blood_meteor.wav", 450, math.random(200, 250), 0.2, CHAN_STATIC)

    local phys = self:GetPhysicsObject()
    if IsValid(phys) then
        phys:SetMass(0)
        phys:SetVelocity(Vector(0,0, self.speed))

        phys:Wake()

    end

    timer.Simple(20, function()
        if IsValid(self) then
            self:Remove()
            
        end
    
    end)
end

function ENT:PhysicsCollide(data, phys)
    local ent = data.HitEntity
    local pos = data.HitPos
    if ent and ent ~= self and ent:GetClass() ~= self:GetClass() then
        self.shouldspeed = false
        self:Explode()
    end
end

function ENT:Explode()
    if !IsValid(self) or self.got then return end
    self.got = true
    local damage = 300
    local ply = self:GetOwner()

    if ply:GetNWBool("bm_zone") then
        damage = damage*1.5
    end

    ParticleEffect( "bm_supernova_2", self:GetPos() - Vector(0,0,30), Angle(0,0,0), ent )
    ParticleEffect( "bm_blood_explode_2", self:GetPos() - Vector(0,0,30), Angle(0,0,0), ent )
    self:EmitSound("bloodmanipulation/piercing_end.wav", 400, math.random(150, 200), 1, CHAN_STATIC)

    util.ScreenShake(self:GetPos(), 50, 40, 1, 4000, true)

    local entities = ents.FindInSphere(self:GetPos(), 400)

    for _, ent in ipairs(entities) do

        if ent:IsValid() and ( ent ~= ply and ent ~= self ) and !ent:GetNWBool("barrier") then
            if SERVER then

                local dir = (ent:GetPos() - self:GetPos()):GetNormalized()
                local force = 2000

                local phys = ent:GetPhysicsObject()
                
                if IsValid(phys) then
                    phys:EnableMotion(true)
                    constraint.RemoveAll(ent)

                    phys:SetVelocity(dir * force)
                end

                ent:SetVelocity((dir * force))
                
                ent:TakeDamage(damage, ply, self)
            end
        end
    end

    if IsValid(self) then
        self:Remove()
        
    end
end

function ENT:Think()
    local phys = self:GetPhysicsObject()

    if IsValid(phys) then
        phys:SetVelocity(Vector(0,0, self.speed))
        phys:Wake()
        self:SetAngles(Angle(0,0,0))
        ParticleEffect("bm_meteor_trail", self:GetPos() , Angle(0, 0, 0), self)

    end

    local trace = util.TraceLine({
        start = self:GetPos(),
        endpos = self:GetPos(),
        filter = self
    })

    local entities = ents.FindInSphere(trace.HitPos, 100)

    for _, ent in ipairs(entities) do

        if IsValid(ent) and ent:GetClass() ~= "bm_meteorite" and ent ~= self:GetOwner() and ent:IsSolid() then
            if SERVER then
                self:Explode()
            end
        end
    end
    
end