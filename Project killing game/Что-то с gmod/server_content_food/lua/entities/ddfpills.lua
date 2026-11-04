if (SERVER)then
	AddCSLuaFile("ddfpills.lua")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "DDF Food"
ENT.PrintName = "Pills"
ENT.Spawnable = true

function ENT:SetupDataTables()

	
end



if (SERVER)then
	function ENT:Initialize( )
		self:SetModel("models/w_models/weapons/w_eq_painpills.mdl")
	    self:SetUseType(SIMPLE_USE)
	    self:SetMoveType(MOVETYPE_VPHYSICS)
	    self:PhysicsInit(SOLID_VPHYSICS)
	    self:SetSolid( SOLID_VPHYSICS )
	    self:PhysWake()
	end
end

if (SERVER)then
	function ENT:Use(activator)
		if (activator:IsPlayer()) then
			if activator:GetNWFloat("CurrentCyberpsychosis")<10 then
				activator:SetNWFloat("CurrentCyberpsychosis", 0)
			else
				activator:SetNWFloat("CurrentCyberpsychosis",  activator:GetNWFloat("CurrentCyberpsychosis")-10)
			end
		end
		self:Remove()
	end
end