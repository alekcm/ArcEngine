if (SERVER)then
	AddCSLuaFile("circle_count.lua")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Circle count"
ENT.Spawnable = true
ENT.Editable = true

function ENT:SetupDataTables()

    self:NetworkVar( "Bool",	0, "Hide",	{ KeyName = "Hide",	Edit = { type = "Bool", order = 0} } )
	
	if ( SERVER ) then
		self:NetworkVarNotify( "Hide", self.OnHideChanged )
	end
end


if SERVER then
	function ENT:Initialize( )
		self:SetModel("models/hunter/blocks/cube025x025x025.mdl")
	    self:SetSolid( SOLID_VPHYSICS )
	    self:SetTrigger( true )
	    self:PhysWake()
	    self:SetCollisionGroup(20)

	    local spriteposrot = {
		{Vector(-43.442375, -104.837540, 52), Angle(-0.000, -111.637, 0.000)},
		{Vector(0.169975, -118.951653, 52), Angle(-0.006, -91.597, 0.000)},
		{Vector(49.730824, -108.338623, 52),Angle(-0.006, -65.725, 0.000)},
		{Vector(88.211296, -82.693779, 52),Angle(-0.006, -45.397, 0.000)},
		{Vector(115.656097, -39.731983, 52), Angle(-0.006, -22.560, 0.000)},
		{Vector(127.672897, 7.918516, 52),Angle(-0.006, -0.912, 0.000)},
		{Vector(114.796494, 56.752899, 52),Angle(-0.006, 21.264, 0.000)},
		{Vector(86.263191, 96.964172, 52),Angle(-0.006, 48.984, 0.000)},
		{Vector(48.019989, 126.108894, 52),Angle(-0.006, 68.124, 0.000)},
		{Vector(-3.432016, 135.415482, 52),Angle(-0.006, 96.107, 0.000)},
		{Vector(-49.286682, 122.298569, 52),Angle(0.025, 115.114, 0.000)},
		{Vector(-90.742256, 96.810326, 52),Angle(-0.006, 131.482, 0.000)},
		{Vector(-115.879585, 55.111664, 52),Angle(-0.006, 153.394, 0.000)},
		{Vector(-126.306725, 6.595324, 52),Angle(-0.006, -176.245, 0.000)},
		{Vector(-119.126266, -42.283844, 52),Angle(-0.006, -154.993, 0.000)},
		{Vector(-90.291351, -83.047600, 52),Angle(-0.006, -134.400, 0.000)}}

		for i=1,16 do
		    local sprite = ents.Create("Sprite")
		    sprite:SetParent(self)
		    sprite:SetLocalPos(spriteposrot[i][1])
		    sprite:SetLocalAngles(spriteposrot[i][2])
		    sprite:SetNWString("CharacterName", CurrentPlayers[1][i])
		    sprite:Spawn()
		end
	end
end

function ENT:OnHideChanged( name, old, new )
	if (new == true) then
		self:SetMaterial("aaa/empty")
	else
		self:SetMaterial("")
	end
end

function ENT:Draw()
	self:DrawModel()
end