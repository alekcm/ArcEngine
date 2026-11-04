if (SERVER)then
	AddCSLuaFile("Watercreater.lua")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Water Machine"
ENT.Spawnable = false

	




function ENT:Initialize( )
		self:SetModel("models/props_interiors/vendingmachinesoda01a.mdl")
    self:SetUseType(SIMPLE_USE)
    self:SetMoveType(MOVETYPE_VPHYSICS)
    self:PhysicsInit(SOLID_VPHYSICS)
    self:SetSolid( SOLID_VPHYSICS )
    --self:SetMaterial("aaa/empty")

end




	
function ENT:Use(activator)
	if (activator:IsPlayer()) then
		local ent = ents.Create("water")
		ent:SetPos(self:GetPos()+Vector(-16,4,-25))
		ent:Spawn()
		ent:PhysWake()
		ent:GetPhysicsObject():SetVelocity(Vector(-200, 0, 0))
	--local UI = vgui.Create("DLabelEditable")
end
end

function ENT:Draw()
	self:DrawModel()

end