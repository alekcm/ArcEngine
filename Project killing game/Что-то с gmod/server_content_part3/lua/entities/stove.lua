if (SERVER)then
	AddCSLuaFile("stove.lua")

end


ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Stove"
ENT.Spawnable = true
	


if (SERVER)then
function ENT:Initialize( )
		self:SetModel("models/sickness/stove_01.mdl")
    self:SetUseType(SIMPLE_USE)
    self:SetMoveType(MOVETYPE_VPHYSICS)
    self:PhysicsInit(SOLID_VPHYSICS)
    self:SetSolid( SOLID_VPHYSICS )
   -- self:SetMaterial("aaa/empty")
    local ang = self:GetAngles()
	self:SetAngles(Angle (0,0,0))

self:SetTrowPos(ents.Create("gmod_button"))
	self:GetTrowPos():SetModel("models/Gibs/HGIBS.mdl")
	self:GetTrowPos():Spawn()
	self:GetTrowPos():SetPos(self:GetPos()+Vector(0, 0, 10))
	self:GetTrowPos():SetParent(self)
	self:GetTrowPos():SetMaterial("aaa/empty")
	self:SetAngles(ang)
end
end



local products = {
        {"DDFegg_cooked", 5},
    	{"ddfturkey_cooked", 15},
        {"DDFpizza_cooked",10},
    	{"DDFwrap_cooked",15},
    	{"DDFtoast_cooked",3},
   		{"DDFfish_cooked",7},
   		{"DDFpotato_cooked",10}
        
}
local pos

function ENT:StartTouch(entity)
    if entity:GetModel() == "models/foodnhouseholditems/egg1.mdl" then
        pos = entity:GetPos()
        entity:Remove()
        timer.Simple(products[1][2], function()
                local entit = ents.Create(products[1][1])
		entit:SetPos(pos)
		entit:Spawn()
		entit:PhysWake()
            end)
end
    if entity:GetModel() == "models/foodnhouseholditems/turkey.mdl" then
        pos = entity:GetPos()
        entity:Remove()
        timer.Simple(products[2][2], function()
                local entit = ents.Create(products[2][1])
		entit:SetPos(pos)
		entit:Spawn()
		entit:PhysWake()
            end)
end
    if entity:GetModel() == "models/foodnhouseholditems/pizzabox.mdl" then
        pos = entity:GetPos()
        entity:Remove()
        timer.Simple(products[3][2], function()
                local entit = ents.Create(products[3][1])
		entit:SetPos(pos)
		entit:Spawn()
		entit:PhysWake()
            end)
end
     if entity:GetModel() == "models/griim/foodpack/twinkie.mdl" then
        pos = entity:GetPos()
        entity:Remove()
        timer.Simple(products[4][2], function()
                local entit = ents.Create(products[4][1])
		entit:SetPos(pos)
		entit:Spawn()
		entit:PhysWake()
            end)
end
    if entity:GetModel() == "models/foodnhouseholditems/bread_slice.mdl" then
        pos = entity:GetPos()
        entity:Remove()
        timer.Simple(products[5][2], function()
                local entit = ents.Create(products[5][1])
		entit:SetPos(pos)
		entit:Spawn()
		entit:PhysWake()
            end)
end
    if entity:GetModel() == "models/foodnhouseholditems/fishbass.mdl" then
        pos = entity:GetPos()
        entity:Remove()
        timer.Simple(products[6][2], function()
                local entit = ents.Create(products[6][1])
		entit:SetPos(pos)
		entit:Spawn()
		entit:PhysWake()
            end)
end
    
     if entity:GetModel() == "models/foodnhouseholditems/potato.mdl" then
        pos = entity:GetPos()
        entity:Remove()
        timer.Simple(products[7][2], function()
                local entit = ents.Create(products[7][1])
		entit:SetPos(pos)
		entit:Spawn()
		entit:PhysWake()
            end)
end
    end


function ENT:Draw()
	self:DrawModel()

end