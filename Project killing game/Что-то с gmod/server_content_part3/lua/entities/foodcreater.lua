if (SERVER)then
	AddCSLuaFile("Foodcreater.lua")

	util.AddNetworkString("SpawnFood")
	util.AddNetworkString("SpawnFood2")
	util.AddNetworkString("SpawnFood3")
	util.AddNetworkString("SpawnFood4")
end



ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Food Machine"
ENT.Spawnable = true
	

local products = {
        {"DDFapple", 5},
    	{"DDFtoast", 2},
    	{"DDFegg", 3},
        {"DDFjuice",7},
        {"DDFbeer",7},
        {"DDFdonut",3},
        {"DDFbread",5},
    	{"DDFfish", 10},
        {"DDFcolla",25},
        {"DDFpizza",25},
        {"DDFbeacon",4},
    	{"DDFpotato", 5},
        {"DDFpepsi",10},
        {"DDFwatermelon",15},
        {"DDFsandwich",10},
        {"DDFwrap",15},
		{"DDFturkey",30},
    	{"DDFenergydrink",10},
    	{"DDFwine",20},
    	{"DDFrome",30}
}

function ENT:SetupDataTables()
	self:NetworkVar("Entity", 0, "TrowPos")
end

if (SERVER)then
function ENT:Initialize( )
		self:SetModel("models/props_interiors/refrigerator03.mdl")
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
	--self:GetTrowPos():SetPos(self:GetPos()+Vector(35, 0, -10))
    self:GetTrowPos():SetPos(self:GetPos()+Vector(25, 0, 50))
	self:GetTrowPos():SetParent(self)
	self:GetTrowPos():SetMaterial("aaa/empty")
	self:SetAngles(ang)
end
end


	
function ENT:Use(activator)
	if (activator:IsPlayer()) then		
		net.Start("SpawnFood")
		net.WriteEntity(self)
		net.Send(activator)
end
end
local pos
local thisent
local single = true
local model = nil
if CLIENT then
	local function fe(hz)
       if hz:IsValid() then
        if self == lst2 then
            net.Start("SpawnFood4")
            net.WriteVector(hz:GetTrowPos():GetPos())
            net.SendToServer()
        end
       end
	end
net.Receive("SpawnFood3", function ()
	local lst2 = net.ReadEntity()
	fe(lst2)
	end)
end
local single = true
local function SpawnFood()
    if single == true then
       single = false
  --  timer.Simple(products[count][2], function()
	local entit = ents.Create(products[count][1])
		entit:SetPos(pos)
		entit:Spawn()
		entit:PhysWake()
        timer.Simple(1,function()
            single = true
            end)
        end
--end)
end

net.Receive("SpawnFood4", function ()
	pos = net.ReadVector()
	SpawnFood()
	end)

net.Receive("SpawnFood2", function ()
	count = net.ReadFloat()
	thisent = net.ReadEntity()
	net.Start("SpawnFood3")
	net.WriteEntity(thisent)
	net.Broadcast()
	single = true
	end)



function ENT:Draw()
	self:DrawModel()

end
print("foodcreater saved")