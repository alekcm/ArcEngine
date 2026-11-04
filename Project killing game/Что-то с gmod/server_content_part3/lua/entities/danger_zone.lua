if (SERVER)then
	AddCSLuaFile("danger_zone.lua")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Danger zone"
ENT.Spawnable = true
ENT.Editable = true

function ENT:SetupDataTables()
	self:NetworkVar( "String",	0, "NameZone",	{ KeyName = "NameZone",	Edit = { type = "String", order = 0} } )
    self:NetworkVar( "String",	1, "Model",	{ KeyName = "Model",	Edit = { type = "String", order = 1} } )
    self:NetworkVar( "String",	2, "MessageTouch",	{ KeyName = "MessageTouch",	Edit = { type = "String", order = 2} } )
    self:NetworkVar( "Bool",	3, "Freeze",	{ KeyName = "Freeze",	Edit = { type = "Bool", order = 3} } )
    self:NetworkVar( "Bool",	4, "Kill",	{ KeyName = "Kill",	Edit = { type = "Bool", order = 4} } )
    self:NetworkVar( "Bool",	5, "Hide",	{ KeyName = "Hide",	Edit = { type = "Bool", order = 5} } )
    self:NetworkVar( "String",	3, "OwnerZone",	{ KeyName = "OwnerZone",	Edit = { type = "String", order = 6} } )
    self:NetworkVar( "Int",	0, "Damage",	{ KeyName = "Damage",	Edit = { type = "Int", min = 0, max = 100, order = 7} } )
    self:NetworkVar( "Bool",	0, "Explode",	{ KeyName = "Explode",	Edit = { type = "Bool", order = 8} } )
	
	if ( SERVER ) then
		self:NetworkVarNotify( "NameZone", self.OnNameChanged )
		self:NetworkVarNotify( "Model", self.OnCharacterNameChanged )
		self:NetworkVarNotify( "Hide", self.OnHideChanged )
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

function ENT:OnNameChanged( name, old, new )
	self:SetNWString("NameZone",new)
end

function ENT:StartTouch( hitEnt )
 	if ( hitEnt:IsValid() and hitEnt:IsPlayer()) then

 		if(hitEnt:IsSuperAdmin() == false and hitEnt:IsUserGroup( "spectator" )==false) then
 			
	 		if(self:GetMessageTouch() != "") then
	 			hitEnt:ChatPrint( self:GetMessageTouch() )
	 		end
	 		if(self:GetFreeze() == true) then
	 			hitEnt:Freeze(true)
	 		end
	 		 if(self:GetKill() == true) then
	 			hitEnt:Kill()
	 		end
	 		if(self:GetDamage()!=0) then
	 			local dam = DamageInfo()

	 			dam:SetAttacker(hitEnt)
	 			dam:SetInflictor(hitEnt)
	 			dam:SetDamage(self:GetDamage())
	 			dam:SetDamageType(DMG_FALL)

	 			hitEnt:TakeDamageInfo(dam)
	 		end

	 		if(self:GetExplode() == true) then
	 			local explo = ents.Create( "env_explosion" )
		   		explo:SetPos( hitEnt:GetPos() )
		       explo:Spawn()
		       explo:Fire( "Explode" )
		       explo:SetKeyValue( "IMagnitude", 50 )
		       hitEnt:Ignite()

		       local dam = DamageInfo()

	 			dam:SetAttacker(hitEnt)
	 			dam:SetInflictor(hitEnt)
	 			dam:SetDamage(hitEnt:Health())
	 			dam:SetDamageType(DMG_BLAST)
	 			hitEnt:TakeDamageInfo(dam)
	 		end

	 		if (self:GetNameZone() != "") then
		 		for k, v in ipairs( player.GetAll() ) do
					if v:IsSuperAdmin() then
						v:ChatPrint(hitEnt:GetName() .. " вошёл в зону - " .. self:GetNWString("NameZone") )
					end
					if v:Nick() == self:GetOwnerZone() then
						v:ChatPrint(hitEnt:GetName() .. " вошёл в зону - " .. self:GetNWString("NameZone") )
					end
				end
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