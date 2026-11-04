if (SERVER)then
	AddCSLuaFile("ddfpc.lua")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "DDF PC"
ENT.PrintName = "Нейростимулятор"
ENT.Spawnable = true

if (SERVER)then
function ENT:Initialize( )
		self:SetModel("models/nt/props_warehouse/sack_h.mdl")
		self:SetModelScale(0.2)
    self:SetUseType(SIMPLE_USE)
    self:SetMoveType(MOVETYPE_VPHYSICS)
    self:PhysicsInit(SOLID_VPHYSICS)
    self:SetSolid( SOLID_VPHYSICS )
    self:PhysWake()

end
end


local single1 = true
function ENT:Use(activator)
	if single1 then
		single1 = false
	if (activator:IsPlayer()) then
		activator:SetNWFloat("CurrentCyberpsychosis",activator:GetNWFloat("CurrentCyberpsychosis") - 20)
		self:Remove()
	end
	timer.Simple(1, function()
	single1 = true
end)
end
end

function ENT:Draw()
	self:DrawModel()
end