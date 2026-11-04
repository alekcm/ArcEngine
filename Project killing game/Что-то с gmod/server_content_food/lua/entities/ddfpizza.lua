if (SERVER)then
	AddCSLuaFile("ddfpizza.lua")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "DDF Food"
ENT.PrintName = "Pizza"
ENT.Spawnable = true

function ENT:SetupDataTables()

self:NetworkVar( "Int",	0, "Parts",	{ KeyName = "Parts",	Edit = { type = "Int", order = 0, min = 1, max = 10} } )
	
end

local food = 2
local thirsty = 0
local energy = 0
local alcohol = 0
local damage = 0
local storageTime = 120

local function Corruption(ent)
	timer.Simple(storageTime * 60, function ()
		if ent:IsValid() then
    	if ent:GetParts() > 1 then
			ent:SetParts(ent:GetParts() - 1)
		else
		ent:Remove()
    	end
    	Corruption(ent)
    	end
    	end)
end

if (SERVER)then
function ENT:Initialize( )
		self:SetModel("models/foodnhouseholditems/pizzabox.mdl")
    self:SetUseType(SIMPLE_USE)
    self:SetMoveType(MOVETYPE_VPHYSICS)
    self:PhysicsInit(SOLID_VPHYSICS)
    self:SetSolid( SOLID_VPHYSICS )
    self:PhysWake()
    self:SetParts(8)
    Corruption(self)
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
		if self:GetParts() > 1 then
			self:SetParts(self:GetParts() - 1)
		else
		self:Remove()
	end
end
end

function ENT:Draw()
	self:DrawModel()
	if (LocalPlayer():GetPos():Distance(self:GetPos())<100) then
            AddWorldTip(self:EntIndex(), self:GetParts(), 0.5, self:LocalToWorld(Vector(0, 0, 64)), self)
	end
end