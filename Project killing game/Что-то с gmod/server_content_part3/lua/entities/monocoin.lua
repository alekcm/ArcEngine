if (SERVER)then
	AddCSLuaFile("monocoin.lua")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Monocoin"
ENT.Spawnable = true
ENT.Editable = true
	

if SERVER then
function ENT:Initialize( )
		self:SetModel("models/hunter/plates/plate.mdl")
    self:SetUseType(SIMPLE_USE)
    self:SetMoveType(MOVETYPE_VPHYSICS)
    self:PhysicsInit(SOLID_VPHYSICS)
    self:SetSolid( SOLID_VPHYSICS )
    self:SetMaterial("aaa/empty")

end
end


if SERVER then
	util.AddNetworkString('GetMonocoins')
	end
	
function ENT:Use(activator)
	if (activator:IsPlayer()) then
		local coin = math.random(100,500)
		activator:SetNWInt("Monocoins",activator:GetNWInt("Monocoins")+coin)
		net.Start("GetMonocoins")
		net.WriteFloat(coin)
		net.Send(activator)
		self:Remove()
	--local UI = vgui.Create("DLabelEditable")
end
end

function ENT:Draw()
	self:DrawModel()
	local pos = self:GetPos()+Vector(0,0, 0)
	local ang = self:GetAngles()
	cam.Start3D2D(pos,ang, 0.1)
surface.SetMaterial(Material("Icon/monocoin"))
surface.SetDrawColor(255,255,255,255)
surface.DrawTexturedRect(-25, -25, 50, 50)
cam.End3D2D()
end