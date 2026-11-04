if (SERVER)then
	AddCSLuaFile("watercreator.lua")

	util.AddNetworkString("SpawnWater")
	util.AddNetworkString("SpawnWater2")
	util.AddNetworkString("SpawnWater3")
	util.AddNetworkString("SpawnWater4")
	util.AddNetworkString("SetWatercreatorDisabled")
	local sf = nil
end



ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Water Machine"
ENT.Spawnable = true
	

local products = {
        {"DDFcoffee", 10},
        {"DDFtea",10},
        {"DDFwater",7}
}

function ENT:SetupDataTables()
	self:NetworkVar("Entity", 0, "TrowPos")
	self:NetworkVar("Bool", 1, "CreatingEnabled")
end

if (SERVER)then
function ENT:Initialize( )
	sf = self
		self:SetModel("models/props_interiors/coffee_maker.mdl")
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
	--self:GetTrowPos():SetModel("models/Gibs/HGIBS.mdl")
	self:GetTrowPos():Spawn()
	self:GetTrowPos():SetPos(self:GetPos()+Vector(10, 0, 0))
	self:GetTrowPos():SetParent(self)
	self:GetTrowPos():SetMaterial("aaa/empty")
	self:SetAngles(ang)
end
end


	
function ENT:Use(activator)
	if (activator:IsPlayer() and self:GetCreatingEnabled()) then		
		net.Start("SpawnWater")
		net.WriteEntity(self)
		net.Send(activator)
end
end
local pos
local single = true
local model = nil
if CLIENT then
		local time = 0
	local function fe(hz,zak)
	if self == lst2 then
		timer.Simple(time, function()
		net.Start("SpawnWater4")
		net.WriteVector(hz:GetTrowPos():GetPos())
		net.WriteInt(zak, 8)
		net.SendToServer()
	end)
	end
	end

net.Receive("SpawnWater3", function ()
	local lst2 = net.ReadEntity()
		time = net.ReadFloat()
	local zakaz = net.ReadInt(8)
    if(lst2:IsValid()) then
		fe(lst2,zakaz)
    end
	end)
end
local single = true
local function SpawnFood(zaka)
    if single == true then
       single = false
 --   timer.Simple(products[count][2], function()
	local entit = ents.Create(products[zaka][1])
		entit:SetPos(pos)
		entit:Spawn()
		entit:PhysWake()
        timer.Simple(1,function()
            single = true
            end)
        end
--end)
end

net.Receive("SpawnWater4", function ()
	pos = net.ReadVector()
	SpawnFood(net.ReadInt(8))

	end)

net.Receive("SetWatercreatorDisabled", function ()
local ent = net.ReadEntity()
ent:SetCreatingEnabled(false)
	end)

net.Receive("SpawnWater2", function ()
	local tbl = net.ReadTable()
	if(tbl[1]==5) then
		sound.Play( "watermachine5.mp3", sf:GetPos(), 75, 100, 1)
	end
	if(tbl[1]==7) then
		sound.Play( "watermachine7.mp3", sf:GetPos(), 75, 100, 1)
	end
	timer.Simple(tbl[1], function()
		tbl[3]:SetCreatingEnabled(true)
	end)
	net.Start("SpawnWater3")
	net.WriteEntity(tbl[3])
	net.WriteFloat(tbl[1])
	net.WriteInt(tbl[2], 8)
	net.Broadcast()
	single = true
	end)



function ENT:Draw()
	self:DrawModel()

end