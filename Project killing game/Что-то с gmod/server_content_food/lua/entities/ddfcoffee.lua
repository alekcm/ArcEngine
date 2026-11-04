if (SERVER)then
	AddCSLuaFile("ddfcoffee.lua")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "DDF Food"
ENT.PrintName = "Coffee"
ENT.Spawnable = true


local food = 5
local thirsty = 25
local energy = 10
local alcohol = 0
local damage = 5

if (SERVER)then
function ENT:Initialize( )
    self:SetModel("models/griim/foodpack/coffee_small.mdl")
    self:SetUseType(SIMPLE_USE)
    self:SetMoveType(MOVETYPE_VPHYSICS)
    self:PhysicsInit(SOLID_VPHYSICS)
    self:SetSolid( SOLID_VPHYSICS )
    self:PhysWake()
    --timer.Simple(2, function()
    --self:SetModel("models/themask/scenebuildthemes/groceries/sm_coffee_cup_paper_02.mdl")
            --end)
    
    --[[timer.Simple(2, function()
    self:SetModel("models/themask/scenebuildthemes/groceries/sm_coffee_cup_paper_02.mdl")
    self:SetUseType(SIMPLE_USE)
    self:SetMoveType(MOVETYPE_VPHYSICS)
    self:PhysicsInit(SOLID_VPHYSICS)
    self:SetSolid( SOLID_VPHYSICS )
    self:PhysWake()
            end)]]
end
end


if SERVER then
	util.AddNetworkString('EatFood')
	end

function ENT:Use(activator)
	if (activator:IsPlayer()) then
		net.Start("EatFood")
        local send = {food, thirsty, energy, alcohol, damage}
        net.WriteTable(send)
		net.Send(activator)
		self:Remove()
end
end