if (SERVER)then
	AddCSLuaFile()
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Room Enter"
ENT.Spawnable = true
ENT.Editable = true
	function ENT:SetupDataTables()
	self:NetworkVar( "String",	0, "OwnerName",	{ KeyName = "OwnerName",	Edit = { type = "String", order = 0} } )
    end
--local camera
function ENT:Initialize( )
		self:SetModel("models/hunter/blocks/cube05x05x05.mdl")
		self:SetMaterial("aaa/empty")
    self:SetSolid( SOLID_BBOX )
    self:SetTrigger( true )
    self:PhysWake()
    self:SetCollisionGroup(20)
end
function ENT:Touch( hitEnt )
 	if ( hitEnt:IsValid() and hitEnt:IsPlayer() ) then
        if hitEnt:Name() ~= self:GetOwnerName() then
            if !hitEnt():IsSuperAdmin() and hitEnt():GetUserGroup() ~= "spectator" then
            	net.Start("GetAchiv")
                net.WriteFloat(4)
                net.WriteEntity(hitEnt)
                net.Send(hitEnt)
            end
 		end
	end
end
function ENT:Draw()
self:DrawModel()
end
