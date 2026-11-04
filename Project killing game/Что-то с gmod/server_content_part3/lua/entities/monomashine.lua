if (SERVER)then
	AddCSLuaFile("Monomashine.lua")

	util.AddNetworkString("MoneyCheck")
	util.AddNetworkString("PurchasePresent")
    util.AddNetworkString("DeliveryPresent")
end



ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Monomashine"
ENT.Spawnable = true
	

local presents = {{"Череп","models/gibs/hgibs.mdl"},{"Шарик в виде сердца","models/balloons/balloon_classicheart.mdl"},{"Сфера","models/maxofs2d/hover_rings.mdl"},{"Кукла","models/maxofs2d/companion_doll.mdl"},{"Глобус","models/props_combine/breenglobe.mdl"},{"Бюст из мрамора","models/props_combine/breenbust.mdl"},{"Портфель","models/props_c17/briefcase001a.mdl"},{"Кактус","models/props_lab/cactus.mdl"},{"Часы","models/props_combine/breenclock.mdl"},{"Пила","models/props_junk/sawblade001a.mdl"}}


function ENT:SetupDataTables()
	self:NetworkVar("Entity", 0, "TrowPos")
end

if (SERVER)then
    function ENT:Initialize( )
    	self:SetModel("models/hunter/blocks/cube05x05x05.mdl")
        self:SetUseType(SIMPLE_USE)
        self:SetMoveType(MOVETYPE_VPHYSICS)
        self:PhysicsInit(SOLID_VPHYSICS)
        self:SetSolid( SOLID_VPHYSICS )
        self:SetMaterial("aaa/empty")
        local ang = self:GetAngles()
    	self:SetAngles(Angle (0,0,0))

        self:SetTrowPos(ents.Create("gmod_button"))
        self:GetTrowPos():SetCollisionGroup(20)
    	self:GetTrowPos():Spawn()
        self:GetTrowPos():SetPos(self:GetPos()+Vector(25, 0, 50))
    	self:GetTrowPos():SetParent(self)
    	self:GetTrowPos():SetMaterial("aaa/empty")
    	self:SetAngles(ang)
    end
    net.Receive("PurchasePresent", function(len,ply)
        net.Start("DeliveryPresent")
        net.WriteTable(presents[math.random( 1, 9 )])
        net.Send(ply)
    end)
end

function ENT:Use(activator)
	if (activator:IsPlayer()) then		
		net.Start("MoneyCheck")
		net.WriteEntity(self)
		net.Send(activator)
    end
end

local pos
local thisent
local single = true
local model = nil
if CLIENT then
	
end

function ENT:Draw()
	self:DrawModel()

end
print("Monomashine saved")