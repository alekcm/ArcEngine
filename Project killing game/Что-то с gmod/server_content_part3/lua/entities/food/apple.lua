if (SERVER)then
	AddCSLuaFile("apple.lua")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "DDFApple"
ENT.Spawnable = true


local food = 10
local thirsty = 15
local energy = 0
local alcohol = 0

function ENT:Initialize( )
		self:SetModel("models/foodnhouseholditems/apple.mdl")
    self:SetUseType(SIMPLE_USE)
    self:SetMoveType(MOVETYPE_VPHYSICS)
    self:PhysicsInit(SOLID_VPHYSICS)
    self:SetSolid( SOLID_VPHYSICS )

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