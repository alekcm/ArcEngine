if (SERVER)then
	AddCSLuaFile("spawnpoint.lua")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Spawn Point"
ENT.Spawnable = true
	
local selfpos = nil

if game.GetMap() ==  "dgrv3_ultimateacademy" then
selfpos = Vector(5526.968750, -1060.750000, 1904.125000)
end

function ENT:Initialize( )
			self:SetModel("models/hunter/blocks/cube05x05x05.mdl")
		self:SetMaterial("aaa/empty")
	selfpos = self:GetPos()
    self:SetMoveType(MOVETYPE_VPHYSICS)
    self:PhysicsInit(SOLID_VPHYSICS)
    self:SetSolid( SOLID_VPHYSICS )
    self:SetCollisionGroup(20)
end


hook.Add("PlayerSpawn", "FZSIO", function (ply)
	if selfpos ~= nil then
			ply:SetPos(selfpos + Vector(0,0,50))
		end
	end)


