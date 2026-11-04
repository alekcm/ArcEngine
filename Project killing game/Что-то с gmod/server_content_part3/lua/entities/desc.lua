if (SERVER)then
	AddCSLuaFile("Desc.lua")
end
local draw = false
ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Desc"
ENT.Spawnable = true
ENT.Editable = true
	
function ENT:SetupDataTables()

	self:NetworkVar( "String",	0, "Evidence",	{ KeyName = "Evidence",	Edit = { type = "String", order = 0} } )
    self:NetworkVar( "Int",	1, "Vision",	{ KeyName = "Vision",	Edit = { type = "Int", order = 1, min = 1, max = 20} } )
	self:NetworkVar( "String",	2, "HTMLPath",	{ KeyName = "HTMLPath",	Edit = { type = "String", order = 2} } )
	self:NetworkVar( "String",	3, "BigHTMLPath",	{ KeyName = "BigHTMLPath",	Edit = { type = "String", order = 3} } )
	self:NetworkVar( "String",	1, "IconPath",	{ KeyName = "IconPath",	Edit = { type = "String", order = 4} } )
	
if ( SERVER ) then
	self:NetworkVarNotify( "Evidence", self.OnCharacterNameChanged )
    self:NetworkVarNotify( "Vision", self.OnCharacterNameChanged )
	end
end

local Observation = 5

DescText = {}
if SERVER then

function ENT:Initialize( )
        self:SetVision(5)
		self:SetModel("models/hunter/blocks/cube025x025x025.mdl")
    self:SetUseType(SIMPLE_USE)
    self:SetMoveType(MOVETYPE_VPHYSICS)
    self:PhysicsInit(SOLID_VPHYSICS)
    self:SetSolid( SOLID_VPHYSICS )
    self:SetMaterial("aaa/empty")
    self:SetCollisionGroup(20)
    DescText[self] = ""
        

end
end
function ENT:OnIconTextChanged( varname, oldvalue, newvalue )

	-- Do not rebuild if the size wasn't changed
	if ( oldvalue == newvalue ) then return end

	self.name = newvalue
	local SelfName = self:GetIconText()
end
function ENT:OnEvidenceChanged( varname, oldvalue, newvalue )

	-- Do not rebuild if the size wasn't changed
	if ( oldvalue == newvalue ) then return end

	self.name = newvalue
	local SelfName = self:GetEvidence()
end
if SERVER then

	util.AddNetworkString("GetDesc")
	util.AddNetworkString("GetDescHTMLPath")
	util.AddNetworkString("SetDesc")
	util.AddNetworkString("StartDraw")
	util.AddNetworkString("EndDraw")
	util.AddNetworkString("SendDescByLookForIt")
	util.AddNetworkString("SendDescByLookForIt2")
	util.AddNetworkString("GetDescSlots")
end
function ENT:Use(activator)
	if (activator:IsPlayer() and activator:IsSuperAdmin()) then
		net.Start("GetDesc")
		net.WriteTable({self:GetEvidence(),self:GetHTMLPath(),self:GetBigHTMLPath(),self:GetIconPath()})
		net.WriteString(DescText[self])
		net.WriteEntity(self)
		net.Send(activator)


	--local UI = vgui.Create("DLabelEditable")
end
end
local text
local ent
if SERVER then

net.Receive("SendDescByLookForIt", function(len, ply)
	local ent = net.ReadEntity()
	net.Start("SendDescByLookForIt2")
	net.WriteString(DescText[ent])
	net.WriteEntity(ent)
	net.Send(ply)
end)

net.Receive("SetDesc", function()
	text = net.ReadString()
	ent = net.ReadEntity()
	--print(text)
	ent:SetEvidence(text)
	DescText[ent] = text
	--print(ent:GetEvidence())
	--ent:SetNWString("EvidenceText", text)	
end)
end
net.Receive("EndDraw", function()
	draw = false	
end)

local WE
function ENT:Think()
    
	WE = self:GetPos()
	if (ent == self) then
		self:SetEvidence(text)
	end

end
local RangeMultiple = 5

function ENT:Draw()
   -- local scrw, scrh = ScrW(), ScrH()
    self:DrawModel()
    local dist = LocalPlayer():GetPos():Distance(self:GetPos())
    local drawdist = Observation * RangeMultiple * self:GetVision() * 1.5
    if LocalPlayer():IsSuperAdmin() or (dist < drawdist) then
        local pos = self:GetPos()
        pos:ToScreen()
        cam.Start2D()
        pos = pos:ToScreen()
        surface.SetMaterial(Material("aaa/empty"))
        surface.SetDrawColor(Color(255,255,255,255))
        if LocalPlayer():IsSuperAdmin() then 
        	surface.DrawTexturedRect(pos.x-8,pos.y-8,16,16)
        else
        	surface.DrawTexturedRect(pos.x-16*(1 - dist/drawdist),pos.y-16*(1 - dist/drawdist),32*(1 - dist/drawdist),32*(1 - dist/drawdist))
        end
        cam.End2D()

       
		--[[if !LocalPlayer():IsSuperAdmin() and (LocalPlayer():GetPos():Distance(self:GetPos()))>Observation * RangeMultiple * self:GetVision() then 
			else
	
	local pos = self:GetPos()+Vector(0,0, -5)
	local ang = self:GetAngles()
	local count = self:GetCount()
	cam.Start3D2D(pos,ang, 0.1)
surface.SetMaterial(Material("Icon/"..count))
surface.SetDrawColor(255,255,255,255)
surface.DrawTexturedRect(-50, -50, 100, 100)
cam.End3D2D()]]
end
end





net.Receive("StartDraw", function()
	draw = true	
end)