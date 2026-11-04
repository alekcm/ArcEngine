if (SERVER)then
	AddCSLuaFile("image.lua")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Image"
ENT.Spawnable = true
ENT.Editable = true
	
function ENT:SetupDataTables()

	self:NetworkVar( "String",	0, "ImageURL",	{ KeyName = "ImageURL",	Edit = { type = "String", order = 0} } )
    self:NetworkVar( "String",	1, "MangaName",	{ KeyName = "MangeName",	Edit = { type = "String", order = 1} } )
    self:NetworkVar( "Int",	2, "ImageCount",	{ KeyName = "ImageCount",	Edit = { type = "Int", min = 0, max = 150, order = 2} } )
    self:NetworkVar( "Int",	3, "MaxImageCount",	{ KeyName = "MaxImageCount",	Edit = { type = "Int", min = 0, max = 150, order = 3} } )
    self:NetworkVar( "Bool",	4, "Writing",	{ KeyName = "Writing",	Edit = { type = "Bool", order = 4} } )
    
end

local images = {},{}
if SERVER then
	util.AddNetworkString("SendImageURL")
    
end

function ENT:Initialize( )
	self:SetModel("models/props_lab/binderblue.mdl")
	self:SetUseType(SIMPLE_USE)
    self:SetMoveType(MOVETYPE_VPHYSICS)
    self:PhysicsInit(SOLID_VPHYSICS)
    self:SetSolid( SOLID_VPHYSICS )
    images[self][0] = nil
    --self:SetMaterial("aaa/empty")
end

function ENT:Use(activator)
    if (activator:IsSuperAdmin() and self:GetWriting()) then
    	--images[self][self:GetImageCount()] = self:GetImageURL()
        self:SetNWString("Page"..self:GetImageCount(),self:GetImageURL())
        activator:ChatPrint(self:GetImageURL())
    else
		net.Start("SendImageURL")
        net.WriteEntity(self)
        net.WriteFloat(self:GetMaxImageCount())
		net.Send(activator)
	end
end

function ENT:Draw()
    local text = self:GetMangaName()
	self:DrawModel()
    cam.Start3D2D(self:GetPos()+Vector(0,0,2),self:GetAngles()+Angle(0,0,-90), 0.1)
    
	draw.SimpleText( text, "DermaDefault", -50, 30, color_white )
cam.End3D2D()

end