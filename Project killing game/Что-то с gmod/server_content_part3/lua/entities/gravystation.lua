if (SERVER)then
	AddCSLuaFile()
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Gravity Station"
ENT.Spawnable = true
ENT.Editable = true
	
--local camera
function ENT:Initialize( )
		self:SetModel("models/hunter/blocks/cube05x05x05.mdl")
		self:SetMaterial("aaa/empty")
		self:PhysicsInit(SOLID_VPHYSICS)
		self:SetMoveType(MOVETYPE_VPHYSICS)
		self:SetSolid(SOLID_VPHYSICS)
end
function ENT:Think()
		for i, v in ipairs( player.GetAll() ) do
			if v:GetModelScale() < 0.2 then
				net.Start("GetAchiv")
                net.WriteFloat(2)
                net.WriteEntity(v)
                net.Send(v)
			end
		if self:GetPos():Distance(v:GetPos())<1400 then
			local vpos = v:GetPos()
			local selfpos = self:GetPos()
			if selfpos.z>vpos.z then
				v:SetGravity(-1)
				net.Start("GetAchiv")
                net.WriteFloat(3)
                net.WriteEntity(v)
                net.Send(v)
			else
				v:SetGravity(1)
		end
		end
end
end
function ENT:Draw()
self:DrawModel()
end
