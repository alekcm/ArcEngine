if (SERVER)then
	AddCSLuaFile("sleepingplace.lua")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Sleeping Place"
ENT.Spawnable = false
	
function ENT:SetupDataTables()
	self:NetworkVar("Entity", 0, "SleepPos")
		self:NetworkVar("Entity", 1, "SleepViewPos")
end

if SERVER then
	util.AddNetworkString("StartSleep")
	util.AddNetworkString("EndSleep")
end

function ENT:Initialize( )
		self:SetModel("models/hunter/blocks/cube2x2x2.mdl")
    self:SetUseType(SIMPLE_USE)
    self:SetMoveType(MOVETYPE_VPHYSICS)
    self:PhysicsInit(SOLID_VPHYSICS)
    self:SetSolid( SOLID_VPHYSICS )
    self:SetMaterial("aaa/empty")
    self:SetSleepPos(ents.Create("gmod_button"))
	self:GetSleepPos():SetModel("models/props_c17/doll01.mdl")
	self:GetSleepPos():Spawn()
	local ang = self:GetAngles()
	self:SetAngles(Angle (0,0,0))
	self:GetSleepPos():SetPos(self:GetPos()+Vector(20, 0, -20))
	self:GetSleepPos():SetParent(self)
	self:SetSleepViewPos(ents.Create("gmod_button"))
	self:GetSleepViewPos():SetModel("models/Gibs/HGIBS.mdl")
	self:GetSleepViewPos():Spawn()
	self:GetSleepViewPos():SetPos(self:GetPos()+Vector(-40, 0, -20))
	self:GetSleepViewPos():SetParent(self)
	self:SetAngles(ang)
	timer.Simple(60, function ()
		if (self:GetSleepViewPos() ~= nil) then
		self:GetSleepViewPos():SetMaterial("aaa/empty")
		self:GetSleepPos():SetMaterial("aaa/empty")
	end
		end)
	--sleepplace:SetMaterial("aaa/empty")

end
	
function ENT:Use(activator)
	if (activator:IsPlayer()) then
		if activator:GetPos() == (Vector(self:GetSleepViewPos():GetPos().x,self:GetSleepViewPos():GetPos().y,self:GetSleepViewPos():GetPos().z-50)) then

			--activator:Freeze(false)
			self:GetSleepPos():SetMaterial("aaa/empty")
			activator:SetPos(Vector(self:GetPos().x,self:GetPos().y,self:GetPos().z+10))
			activator:SetEyeAngles(Angle(0,self:GetAngles().y,0))
			activator:SetMaterial(nil)
           -- activator:SetMoveType(2)
			activator:ScreenFade( SCREENFADE.PURGE, Color( 0,0,0, 0 ),100000,0)
			activator:ScreenFade( SCREENFADE.IN, Color( 0,0,0, 255 ),1,0)
		net.Start("EndSleep")
			net.Send(activator)

		else
		--print(activator:GetNet)
		self:GetSleepPos():SetAngles(Angle(-90,self:GetAngles().y,0))
		self:GetSleepPos():SetModel(activator:GetModel())
		self:GetSleepPos():SetMaterial(nil)
		--activator:Freeze(true)
		activator:SetPos(Vector(self:GetSleepViewPos():GetPos().x,self:GetSleepViewPos():GetPos().y,self:GetSleepViewPos():GetPos().z-50))
		activator:SetEyeAngles(Angle(0,self:GetAngles().y-90,90))
	activator:ScreenFade( SCREENFADE.OUT, Color( 0,0,0, 255 ), 2.1, 0 )
		timer.Simple(2, function ()
			activator:ScreenFade( SCREENFADE.PURGE, Color( 0,0,0, 255 ),5000,0)
			net.Start("StartSleep")
			net.Send(activator)
			end)
           -- activator:SetMoveType(10)
		activator:SetMaterial("aaa/empty")
	end
		--ragdl:SetMaterial(nil)
		--activator:SetAngles(Angle(90,self:GetAngles().y,0))
	--	activator:SetEyeAngles(Angle(0,self:GetAngles().y,90))
	--activator:SetFlexScale(90)
	--local UI = vgui.Create("DLabelEditable")
end
end

function ENT:Draw()
	self:DrawModel()

end