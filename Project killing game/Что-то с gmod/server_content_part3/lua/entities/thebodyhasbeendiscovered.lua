if (SERVER)then
	AddCSLuaFile("TheBodyHasBeenDiscovered.lua")
end


ENT.Base = "base_gmodentity"
ENT.Type = "anim"
ENT.Category = "2D Classes"
ENT.PrintName = "BDA"
ENT.Spawnable = true
ENT.Editable = true
	
function ENT:SetupDataTables()

	self:NetworkVar( "String",	0, "KillerName",	{ KeyName = "KillerName",	Edit = { type = "String", order = 0} } )
	self:NetworkVar( "Int",	1, "Count",	{ KeyName = "Count",	Edit = { type = "Int", order = 1, min = 0, max = 100} } )
	
if ( SERVER ) then
	self:NetworkVarNotify( "Count", self.OnCountChanged )
		self:NetworkVarNotify( "KillerName", self.OnKillerNameChanged )
	end
end
if SERVER then
function ENT:Initialize( )
	--self:SetCount(0)
	self:SetModel("models/props_phx/construct/glass/glass_curve360x1.mdl")
    --self:SetUseType(SIMPLE_USE)
    self:SetMoveType(MOVETYPE_VPHYSICS)
    self:PhysicsInit(SOLID_VPHYSICS)
    self:SetSolid( SOLID_VPHYSICS )
    self:PhysWake()
    self:SetCollisionGroup(20)
    --self:Wake()
    self:SetMaterial("aaa/empty")
    --self:SetHullType(HULL_HUMAN)
    --self:SetHullSizeNormal()
   -- self:SetNPCState( NPC_STATE_ILDE )
    --self:SetSolid(SOLID_BBOX)
    --self:DropToFloor()
    --self:SetHealth(25)
    --self:CapabilitiesAdd(CAP_MOVE_GROUND)
    --timer.Simple(1, function ()
    	--SafeRemoveEntity(self)
    --	end)
end
end

function ENT:Think()
	net.Receive("SetKillerName", function ()
		local nm = net.ReadString()
		self:SetKillerName(nm)
		end)
net.Receive("BDA2", function ()
local name = net.ReadString()
if (name ~= self:GetKillerName()) then
	local cnt = self:GetCount()
	self:SetCount(cnt + 1)
	if (self:GetCount() == 3) then
net.Start("BDA4")
net.SendToServer()
	end
end
	end)
if self:GetKillerName() == "" then
	self:SetKillerName(self:GetNWString("CharacterName"))
end
end

function ENT:Use(activator)
	if (activator:IsPlayer()) then
		if (activator:IsSuperAdmin()) then
		net.Start("GetKillerName")
		net.WriteString(self:GetKillerName())
		net.Send(activator)
	--local UI = vgui.Create("DLabelEditable")
end
end
end


function ENT:OnKillerNameChanged( varname, oldvalue, newvalue )

	-- Do not rebuild if the size wasn't changed
	if ( oldvalue == newvalue ) then return end

	self.name = newvalue
	local SelfName = self:GetKillerName()
end
function ENT:OnCountChanged( varname, oldvalue, newvalue )

	-- Do not rebuild if the size wasn't changed
	if ( oldvalue == newvalue ) then return end

	self.name = newvalue
	local SelfName = self:GetCount()
end
function ENT:Draw()
	self:DrawModel()
end