if (SERVER)then
	AddCSLuaFile("ddfwater.lua")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "DDF Food"
ENT.PrintName = "Water"
ENT.Spawnable = true


local food = 0
local thirsty = 20
local energy = 0
local alcohol = 0

if (SERVER)then
function ENT:Initialize( )
		self:SetModel("models/props_everything/glasswater.mdl")
    self:SetUseType(SIMPLE_USE)
    self:SetMoveType(MOVETYPE_VPHYSICS)
    self:PhysicsInit(SOLID_VPHYSICS)
    self:SetSolid( SOLID_VPHYSICS )
    self:PhysWake()
end
end


if SERVER then
	util.AddNetworkString('EatFood')
	end

function ENT:Use(activator)
	if (activator:IsPlayer()) then
		net.Start("EatFood")
        local send = {food, thirsty, energy, alcohol}
        net.WriteTable(send)
		net.Send(activator)
		self:Remove()
end
end