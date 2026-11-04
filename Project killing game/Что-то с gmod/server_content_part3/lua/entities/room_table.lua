if (SERVER)then
	AddCSLuaFile("Room_table.lua")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Room Table"
ENT.Spawnable = true
ENT.Editable = true
	
function ENT:SetupDataTables()

	self:NetworkVar( "String",	0, "CharacterName",	{ KeyName = "CharacterName",	Edit = { type = "String", order = 1} } )

if ( SERVER ) then
	self:NetworkVarNotify( "CharacterName", self.OnCharacterNameChanged )
	end
end
--local camera
local SendedNameForCamera
function ENT:Initialize( )
		self:SetModel("models/hunter/blocks/cube025x2x025.mdl")
		self:SetMaterial("aaa/empty")
		self:PhysicsInit(SOLID_VPHYSICS)
		self:SetMoveType(MOVETYPE_VPHYSICS)
		self:SetSolid(SOLID_VPHYSICS)

end
local _h = 480
local _w = 660
function ENT:OnCharacterNameChanged( varname, oldvalue, newvalue )

	-- Do not rebuild if the size wasn't changed
	if ( oldvalue == newvalue ) then return end

	self.name = newvalue
	local SelfName = self:GetCharacterName()

end

function ENT:Think()
	if self:GetCharacterName() == "" then
self:SetCharacterName(self:GetNWString("CharacterName"))
end
end

function ENT:Draw()
	
self:DrawModel()
local ang = self:GetAngles()
ang:RotateAroundAxis(self:GetAngles():Right(), 90)
ang:RotateAroundAxis(self:GetAngles():Forward(), 90)
local SelfName = self:GetCharacterName()
cam.Start3D2D(self:GetPos(),ang, 0.1)
surface.SetDrawColor(255,255,255,255)
--if !Material("Roomtables/Pixel"..SelfName..".png","noclamp smooth"):IsError() then
	--surface.SetMaterial(Material("Roomtables/Pixel"..SelfName))
    surface.SetMaterial(Material("Roomtables/Pixel"..SelfName))
--else 
       -- surface.SetMaterial(Material("Roomtables/Pixelempty"))
	--end
surface.DrawTexturedRect(0-_w/2, 0-_h/2, _w, _h)
cam.End3D2D()
--[[ang:RotateAroundAxis(Vector(0,0,90), 180)
cam.Start3D2D(self:GetPos()+Vector(-0, 0, 0),ang, 0.1)
surface.SetDrawColor(255,255,255,255)
surface.SetMaterial(Material("Roomtables/Pixel_"..SelfName))
surface.DrawTexturedRect(0-_w/2, 0-_h/2, _w, _h)
cam.End3D2D()]]

end
function ENT:Use()

end