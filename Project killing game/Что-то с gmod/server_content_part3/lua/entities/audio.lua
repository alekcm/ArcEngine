if (SERVER)then
	AddCSLuaFile("Audio.lua")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Audio"
ENT.Spawnable = true
ENT.Editable = true

function ENT:SetupDataTables()

	self:NetworkVar( "String",	0, "AudioFileName",	{ KeyName = "AudioFileName",	Edit = { type = "String", order = 0} } )
	
if ( SERVER ) then
	self:NetworkVarNotify( "AudioFileName", self.OnAudioFileNameChanged )
	end
end


function ENT:Initialize( )
		self:SetModel("models/props_office/videocassette.mdl")
    self:SetUseType(SIMPLE_USE)
    self:SetMoveType(MOVETYPE_VPHYSICS)
    self:PhysicsInit(SOLID_VPHYSICS)
    self:SetSolid( SOLID_VPHYSICS )
    --self:SetMaterial("aaa/empty")

end


if SERVER then
util.AddNetworkString('SendAudio')
	end
function ENT:Use(activator)
	net.Start("SendAudio")
	net.WriteString(self:GetAudioFileName())
	net.Send(activator)
end

function ENT:Draw()
	self:DrawModel()

end