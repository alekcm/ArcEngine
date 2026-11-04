if (SERVER)then
	AddCSLuaFile("horror_zone.lua")
	util.AddNetworkString("ImageHTML")
	util.AddNetworkString("Sound")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Horror zone"
ENT.Spawnable = true
ENT.Editable = true

function ENT:SetupDataTables()
	self:NetworkVar( "String",	0, "ImageHTML",	{ KeyName = "ImageHTML",	Edit = { type = "String", order = 0} } )
    self:NetworkVar( "String",	1, "Model",	{ KeyName = "Model",	Edit = { type = "String", order = 1} } )
    self:NetworkVar( "Bool",	2, "Hide",	{ KeyName = "Hide",	Edit = { type = "Bool", order = 2} } )

	
	if ( SERVER ) then
		self:NetworkVarNotify( "Hide", self.OnHideChanged )
		self:NetworkVarNotify( "Model", self.OnCharacterNameChanged )
	end
end

if SERVER then
	function ENT:Initialize( )
	self:SetModel("models/hunter/blocks/cube075x075x025.mdl")
    self:SetSolid( SOLID_VPHYSICS )
    self:SetTrigger( true )
    self:PhysWake()
    self:SetCollisionGroup(20)
	end
end

function ENT:OnModelChanged( varname, oldvalue, newvalue )
	self:SetModel(self:GetNWString("Model"))
    self:SetSolid( SOLID_VPHYSICS )
	self:SetTrigger( true )
    self:PhysWake()
    self:SetCollisionGroup(20)
end

function ENT:OnHideChanged( name, old, new )
	if (new == true) then
		self:SetMaterial("aaa/empty")
	else
		self:SetMaterial("")
	end
end

function ENT:StartTouch( hitEnt )
 	if ( hitEnt:IsValid() and hitEnt:IsPlayer()) then

 		if(hitEnt:IsUserGroup( "spectator" )==false) then
 			
	 		if(self:GetImageHTML() ~= "") then
	 			net.Start("ImageHTML")
	 			net.WriteString(self:GetImageHTML())
	 			net.Send(hitEnt)
	 		end

		end
	end
end

function ENT:Use(activator)

end

function ENT:Think()

end

function ENT:Draw()
	self:DrawModel()
end

if CLIENT then
	net.Receive("ImageHTML", function()

		local im = net.ReadString()

		local html = vgui.Create( "DImage")
		html:SetSize(ScrW(), ScrH())
		html:SetImage( "materials/horror/"..im..".png" )

		sound.PlayFile( "sound/horror/"..im..".mp3", "", function( channel )
	        channel:Play()
	        channel:SetVolume( 1 )
	    end)

		timer.Simple(1, function()
			html:Remove()
		end)
	end)
end