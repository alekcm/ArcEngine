if (SERVER)then
	AddCSLuaFile("Memory.lua")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "History"
ENT.PrintName = "Audio"
ENT.Spawnable = false
ENT.Editable = true

function ENT:SetupDataTables()

	self:NetworkVar( "String",	0, "AudioFileName",	{ KeyName = "AudioFileName",	Edit = { type = "String", order = 0} } )
	self:NetworkVar( "Int",	1, "Time",	{ KeyName = "Time",	Edit = { type = "Int", min = 0, max = 100 ,order = 1} } )
	
if ( SERVER ) then
	self:NetworkVarNotify( "AudioFileName", self.OnAudioFileNameChanged )
	self:NetworkVarNotify( "Time", self.OnTimeChanged )

	end
end


function ENT:Initialize( )
		self:SetModel("models/props_lab/reciever01a.mdl")
    self:SetUseType(SIMPLE_USE)
    self:SetMoveType(MOVETYPE_VPHYSICS)
    self:PhysicsInit(SOLID_VPHYSICS)
    self:SetSolid( SOLID_VPHYSICS )
    --self:SetMaterial("aaa/empty")

end


if SERVER then
util.AddNetworkString('SendVideo')
	end
function ENT:Use(activator)
	net.Start("SendVideo")
	net.WriteString(self:GetAudioFileName())
	net.WriteFloat(self:GetTime())
	net.Send(activator)
end

function ENT:Draw()
	self:DrawModel()

end