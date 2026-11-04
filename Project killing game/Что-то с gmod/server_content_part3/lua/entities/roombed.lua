if (SERVER)then
	AddCSLuaFile("Roombed.lua")
end

ENT.Type = "anim"
ENT.Base = "base_gmodentity"
ENT.Category = "2D Classes"
ENT.PrintName = "Room Bed"
ENT.Spawnable = false
	
function ENT:SetupDataTables()
	self:NetworkVar("Vector", 0, "SleepPos")
end


if SERVER then
	util.AddNetworkString("StartSleep")
	util.AddNetworkString("EndSleep")
end
local sleepplace
function ENT:Initialize( )
	self:SetModel("models/env/furniture/bed_andrea/bed_andrea_1st.mdl")
    
	sleepplace = ents.Create("Food")
	sleepplace:Spawn()
	--sleepplace:SetMaterial("aaa/empty")
	sleepplace:SetPos(self:GetPos() + Vector(0, -50, 0))
	self:SetSleepPos(sleepplace:GetPos() + Vector(0,25,0))
	sleepplace:SetParent(self)

		self:SetUseType(SIMPLE_USE)
    self:SetMoveType(MOVETYPE_VPHYSICS)
    self:PhysicsInit(SOLID_VPHYSICS)
    self:SetSolid( SOLID_VPHYSICS )
    --self:SetMaterial("aaa/empty")

end


function ENT:OnSleepPosChanged( varname, oldvalue, newvalue )

	-- Do not rebuild if the size wasn't changed
	if ( oldvalue == newvalue ) then return end

	self.name = newvalue
	local SleepPos = self:SleepPosName()
end

function ENT:Use(activator)
	if (activator:IsPlayer()) then
		if activator:IsSuperAdmin() then
			self:SetSleepPos(sleepplace:GetPos())
		end
		if activator:GetPos() == self:GetSleepPos() then
		activator:SetPos(self:GetSleepPos()+Vector(0,0,50))
		activator:ScreenFade( SCREENFADE.PURGE, Color( 0,0,0, 0 ),1,0)
		activator:ScreenFade( SCREENFADE.IN, Color( 0,0,0, 255 ), 0.5, 0 )
		net.Start("EndSleep")
			net.Send(activator)
		--activator:ScreenFade(SCREENFADE.OUT, color_black, 1, 999)
	else
		activator:SetPos(self:GetSleepPos())
		activator:ScreenFade( SCREENFADE.OUT, Color( 0,0,0, 255 ), 2.1, 0 )
		timer.Simple(2, function ()
			activator:ScreenFade( SCREENFADE.PURGE, Color( 0,0,0, 255 ),100000,0)
			net.Start("StartSleep")
			net.Send(activator)
			end)
	
		--activator:ScreenFade(SCREENFADE.IN, color_black, 1, 999)
	end
	

end
end

function ENT:Draw()
	self:DrawModel()

end