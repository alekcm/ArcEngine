if (SERVER)then
	AddCSLuaFile("Bed.lua")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Bed"
ENT.Spawnable = true
	
function ENT:SetupDataTables()
end


if SERVER then
	function ENT:Initialize( )
		if (game.GetMap()=="dgrv3_ultimateacademy") then
			self:SetModel("models/haxxer/normandy/comfybed.mdl")
		else
			self:SetModel("models/furniturepack3/bedroom/full_bed_k.mdl")
		end
		self:SetUseType(SIMPLE_USE)
		self:SetMoveType(MOVETYPE_VPHYSICS)
		self:PhysicsInit(SOLID_VPHYSICS)
		self:SetSolid( SOLID_VPHYSICS )
		self:SetCollisionGroup(0)
	end
end

if SERVER then
util.AddNetworkString("SleepNumber")
util.AddNetworkString("RemoveRagdoll")
end


function ENT:Use(activator)
	if (activator:IsPlayer()) then
        activator:ScreenFade( SCREENFADE.OUT, Color( 0,0,0, 255 ), 2.1, 0 )
		activator:ScreenFade( SCREENFADE.STAYOUT, Color( 0,0,0, 255 ),5000,0)
		activator:SetPos(self:GetPos()+Vector(0,0,50))
		activator:SetEyeAngles(self:GetAngles()+Angle(0,260,0))
		local ragdoll = ents.Create( "prop_animatable" )
		if (game.GetMap()=="dgrv3_ultimateacademy") then
			ragdoll:SetModel( activator:GetModel() )
			ragdoll:SetPos( self:GetPos()+Vector(0,0,30) )
	        ragdoll:SetParent(self,-1)
	        ragdoll:SetLocalPos(Vector(20,-5,30))
	        ragdoll:SetAngles( self:GetAngles()+Angle(-80,360,0) )
			ragdoll:Spawn()
		else
			ragdoll:SetModel( activator:GetModel() )
			ragdoll:SetPos( self:GetPos()+Vector(0,0,30) )
	        ragdoll:SetParent(self,-1)
	        ragdoll:SetLocalPos(Vector(-5,-5,20))
	        ragdoll:SetAngles( self:GetAngles()+Angle(-83,360,0) )
			ragdoll:Spawn()
		end
        activator:SetMoveType( MOVETYPE_NOCLIP )
        activator:Freeze( true )
		timer.Simple( 1, function()
            net.Start("StartSleep")
			net.Send(activator)
			net.Start("SleepNumber")
			net.WriteEntity(ragdoll)
			net.Send(activator)
		end )
	end
end

function ENT:Draw()
	self:DrawModel()
end

net.Receive('RemoveRagdoll', function()
	local a = net.ReadEntity()
    local id = string.lower(net.ReadString())
    local ply
	for k,v in ipairs(player.GetAll()) do
	local dra = string.lower(v:SteamID())
	if (dra == id) then
	ply = v
	end
	end
    ply:Freeze( false )
    ply:SetMoveType( MOVETYPE_WALK )
    a:Remove()
    net.Start("EndSleep")
	net.Send(ply)
end)