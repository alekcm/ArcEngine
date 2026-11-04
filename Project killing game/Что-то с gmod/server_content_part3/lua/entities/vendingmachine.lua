if (SERVER)then
	AddCSLuaFile("vendingmachine.lua")

	util.AddNetworkString("SpawnVending")
	util.AddNetworkString("SpawnVending2")
	util.AddNetworkString("SpawnVending3")
	util.AddNetworkString("SpawnVending4")
	util.AddNetworkString("SetWatercreatorDisabled")
	local sf = nil
end



ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Vending Machine"
ENT.Spawnable = true
	

local products = {
        {"DDFbeer", 1},
        {"DDFcolla",1},
        {"DDFpepsi",1},
        {"DDFsandwich",1},
        {"DDFenergydrink",1}
}

function ENT:SetupDataTables()
	self:NetworkVar("Entity", 0, "TrowPos")
	self:NetworkVar("Bool", 1, "CreatingEnabled")
end

if (SERVER)then
function ENT:Initialize( )
	sf = self
		self:SetModel("models/gta_prop_michou/prop_vend_fridge01.mdl")
		self:SetCreatingEnabled(true)
    self:SetUseType(SIMPLE_USE)
    self:SetMoveType(MOVETYPE_VPHYSICS)
    self:PhysicsInit(SOLID_VPHYSICS)
    self:SetSolid( SOLID_VPHYSICS )
    --self:SetMaterial("aaa/empty")
    local ang = self:GetAngles()
	self:SetAngles(Angle (0,0,0))

self:SetTrowPos(ents.Create("gmod_button"))
    self:GetTrowPos():SetCollisionGroup(20)
	self:GetTrowPos():Spawn()
	self:GetTrowPos():SetPos(self:GetPos()+Vector(10, 0, 0))
	self:GetTrowPos():SetParent(self)
	self:GetTrowPos():SetMaterial("aaa/empty")
	self:SetAngles(ang)
end
end


	
function ENT:Use(activator)
	if (activator:IsPlayer() and self:GetCreatingEnabled()) then		
		net.Start("SpawnVending")
		net.WriteEntity(self)
		net.Send(activator)
end
end
local pos
local single = true
local model = nil

local single = true
local function SpawnFood()
    if single == true then
       single = false
 --   timer.Simple(products[count][2], function()
	local entit = ents.Create(products[count][1])
		entit:SetPos(pos+Vector(20,20,20))
		entit:Spawn()
		entit:PhysWake()
        timer.Simple(1,function()
            single = true
            end)
        end
--end)
end

net.Receive("SpawnVending4", function (len,ply)
	sound.Play( "vending.mp3", sf:GetPos(), 75, 100, 1)
	pos = net.ReadVector()
	ply:SetNWInt("Monocoins", net.ReadInt(16))
	SpawnFood()
end)

net.Receive("SetWatercreatorDisabled", function ()
local ent = net.ReadEntity()
ent:SetCreatingEnabled(false)
	end)

net.Receive("SpawnVending2", function ()
	local tbl = net.ReadTable()
	count = tbl[2]
	timer.Simple(tbl[1], function()
		tbl[3]:SetCreatingEnabled(true)
	end)
	net.Start("SpawnVending3")
	net.WriteEntity(tbl[3])
	net.WriteFloat(tbl[1])
	net.WriteDouble(tonumber(tbl[4]))
	net.Send(net.ReadEntity())
	single = true
	end)



function ENT:Draw()
	self:DrawModel()

end