if (SERVER)then
	AddCSLuaFile("Micro.lua")
end

local matLight = Material("sprites/light_ignorez")

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Microphone"
ENT.Spawnable = true
ENT.Editable = false
	
function ENT:SetupDataTables()

self:NetworkVar( "Int",	0, "Work",	{ KeyName = "Work",	Edit = { type = "Int", order = 0, min = 1, max = 2} } )
	
if ( SERVER ) then

	end
end


if SERVER then
function ENT:Initialize( )
	self:SetModel("models/roleplay/microphone_full.mdl")
    self:SetUseType(SIMPLE_USE)
    self:SetMoveType(MOVETYPE_VPHYSICS)
    self:PhysicsInit(SOLID_VPHYSICS)
    self:SetSolid( SOLID_VPHYSICS )
	self:SetWork(1)
    self:SetCollisionGroup(20) 
end
end
if SERVER then
end
function ENT:Use(activator)
	if (activator:IsPlayer()) then
		if(self:GetWork()==1) then
			self:SetWork(2)
		else 
			self:SetWork(1)
		end
	end
end
local text
local ent


function ENT:Think()
    


end

function ENT:Draw()
	self:DrawModel()
	
	if (LocalPlayer():GetPos():Distance(self:GetPos())<50) then
        if (self:GetWork()==2) then
            AddWorldTip(self:EntIndex(), "Включён", 0.5, self:LocalToWorld(Vector(0, 0, 64)), self)
        else
            AddWorldTip(self:EntIndex(), "Выключен", 0.5, self:LocalToWorld(Vector(0, 0, 64)), self)
        end
	end
end