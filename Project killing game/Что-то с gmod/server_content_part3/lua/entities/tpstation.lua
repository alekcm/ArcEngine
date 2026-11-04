if (SERVER)then
	AddCSLuaFile()
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Teleport Station"
ENT.Spawnable = true
ENT.Editable = true
	
function ENT:SetupDataTables()
    self:NetworkVar( "Vector",	1, "TelPos",	{ KeyName = "TelPos",	Edit = { type = "Vector",	order = 1} } )
    self:NetworkVar( "Angle",	2, "TelRot",	{ KeyName = "TelRot",	Edit = { type = "Angle",	order = 2} } )
    self:NetworkVar( "String",	3, "StationName",	{ KeyName = "StationName",	Edit = { type = "String",	order = 3} } )
end

if SERVER then
	util.AddNetworkString("SendStationName")
	util.AddNetworkString("SendStationName2")
	end
--local camera
function ENT:Initialize( )
		self:SetModel("models/props_trainstation/payphone001a.mdl")
		--self:SetMaterial("aaa/empty")
		self:PhysicsInit(SOLID_VPHYSICS)
		self:SetMoveType(MOVETYPE_VPHYSICS)
		self:SetSolid(SOLID_VPHYSICS)
end
function ENT:Use(ply)
		net.Start("SendStationName")
		net.WriteString(self:GetStationName())
		net.WriteTable({self:GetTelPos(),self:GetTelRot()})
		net.Send(ply)
end
net.Receive("SendStationName2", function ()
	local tp = net.ReadTable()
	tp[3]:SetPos(Vector(tp[1]))
	tp[3]:SetEyeAngles(Angle(tp[2]))
	end)
function ENT:Draw()
self:DrawModel()
end

if SERVER then
hook.Add( "ShouldCollide", "CustomCollisions", function( ent1, ent2 )

        print(ent1)
        print(ent2)
    -- If players are about to collide with each other, then they won't collide.
        --if (LocalPlayer():Nick() == "Рантаро Амами" and ) then
    --return false false
        --end
    --if ( ent1:IsPlayer() and ent2:IsPlayer() ) then return false end

end )
    end
