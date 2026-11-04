
AddCSLuaFile()

DEFINE_BASECLASS("base_anim")

ENT.PrintName = "Miside Door"
ENT.Author = "Pilot"
ENT.Information = "An editable door that can be used to teleport players."
ENT.Category = "EZ Door"

ENT.Editable = true
ENT.Spawnable = true
ENT.AdminOnly = true

function ENT:SetupDataTables()
	self:NetworkVar("Int", 0, "ID")
	self:NetworkVar("Int", 1, "Sister")

	self:NetworkVar("String", 0, "DoorName", {KeyName = "doorname", Edit = {type = "String", order = 1}})
	self:NetworkVar("String", 1, "DoorModel", {KeyName = "doormodel", Edit = {type = "String", order = 2}})
	self:NetworkVar("String", 2, "DoorSound", {KeyName = "doorsound", Edit = {type = "String", order = 3}})

	self:NetworkVar("Float", 0, "TimeToEnter", {KeyName = "timetoenter", Edit = {type = "Float", min = 0, max = 9999, order = 4}})
	self:NetworkVar("Int", 3, "DistanceToUse", {KeyName = "distancetouse", Edit = {type = "Int", min = 0, max = 9999, order = 5}})
	self:NetworkVar("Bool", 0, "UseTriggerBounds", {KeyName = "usetriggerbounds", Edit = {type = "Boolean", order = 6}})

	self:NetworkVar("Vector", 0, "TeleportOffsetVec")
	self:NetworkVar("Float", 1, "OffsetX", {KeyName = "x", Edit = {type = "Float", category = "Vector", min = -500, max = 500, order = 7}})
	self:NetworkVar("Float", 2, "OffsetY", {KeyName = "y", Edit = {type = "Float", category = "Vector", min = -500, max = 500, order = 8}})
	self:NetworkVar("Float", 3, "OffsetZ", {KeyName = "z", Edit = {type = "Float", category = "Vector", min = -500, max = 500, order = 9}})

	self:NetworkVar("Angle", 0, "TeleportOffsetAng")
	self:NetworkVar("Float", 4, "OffsetPitch", {KeyName = "pitch", Edit = {type = "Float", category = "Angle", min = 0, max = 360, order = 10}})
	self:NetworkVar("Float", 5, "OffsetYaw", {KeyName = "yaw", Edit = {type = "Float", category = "Angle", min = 0, max = 360, order = 11}})
	self:NetworkVar("Float", 6, "OffsetRoll", {KeyName = "roll", Edit = {type = "Float", category = "Angle", min = 0, max = 360, order = 12}})

	if (SERVER) then
		self:NetworkVarNotify("DoorModel", self.OnModelChanged)

		self:NetworkVarNotify("OffsetX", self.OnVectorChanged)
		self:NetworkVarNotify("OffsetY", self.OnVectorChanged)
		self:NetworkVarNotify("OffsetZ", self.OnVectorChanged)

		self:NetworkVarNotify("OffsetPitch", self.OnAngleChanged)
		self:NetworkVarNotify("OffsetYaw", self.OnAngleChanged)
		self:NetworkVarNotify("OffsetRoll", self.OnAngleChanged)
	end
end

function ENT:OnModelChanged(name, old, new)
	self:SetModel(new)
	self:PhysicsInit(SOLID_VPHYSICS)
	self:SetSolid(SOLID_VPHYSICS)
	self:SetUseType(SIMPLE_USE)

	local physics = self:GetPhysicsObject()
	physics:EnableMotion(false)
	physics:Sleep()
end

function ENT:OnVectorChanged(name, old, new)
	local vec = self:GetTeleportOffsetVec()

	if name == "OffsetX" then
		vec.x = new
	end

	if name == "OffsetY" then
		vec.y = new
	end

	if name == "OffsetZ" then
		vec.z = new
	end

	self:SetTeleportOffsetVec(vec)
end

function ENT:OnAngleChanged(name, old, new)
	local ang = self:GetTeleportOffsetAng()

	if name == "OffsetPitch" then
		ang.x = new
	end

	if name == "OffsetYaw" then
		ang.y = new
	end

	if name == "OffsetRoll" then
		ang.z = new
	end

	self:SetTeleportOffsetAng(ang)
end

function ENT:SpawnFunction(ply, tr, ClassName)
	if (!tr.Hit) then return end

	local ent = ents.Create(ClassName)
	ent:SetPos(tr.HitPos + tr.HitNormal)
	ent:Spawn()

	EZDoor.id = EZDoor.id + 1
	ent:SetID(EZDoor.id)

	return ent
end

function ENT:TeleportVec(this)
	local door = self

	if self:HasSister() and not this then
		door = EZDoor:FindByID(self:GetSister())
	end

	if not IsValid(door) then return Vector(0, 0, 0) end

	return door:LocalToWorld(door:OBBCenter() + door:GetTeleportOffsetVec())
end

function ENT:TeleportAng(this)
	local door = self

	if self:HasSister() and not this then
		door = EZDoor:FindByID(self:GetSister())
	end

	if not IsValid(door) then return Vector(0, 0, 0) end

	return door:GetAngles() + door:GetTeleportOffsetAng()
end

function ENT:HasSister()
	return self:GetSister() != 0
end

function ENT:RemoveSister()
	self:SetSister(0)
end

if CLIENT then
	function ENT:Use(activator)
		print("Гитлер")
	end
end

if (SERVER) then
	function ENT:Initialize()
		self:SetModel("models/props_c17/door01_left.mdl")
		self:PhysicsInit(SOLID_VPHYSICS)
		self:SetSolid(SOLID_VPHYSICS)
		self:SetUseType(SIMPLE_USE)

		local physics = self:GetPhysicsObject()
		physics:EnableMotion(false)
		physics:Sleep()

		-- Default variables
		self:SetDoorName("Door")
		self:SetDoorModel(self:GetModel())
		self:SetDoorSound("doors/default_move.wav")
		self:SetTimeToEnter(0.0)
		self:SetDistanceToUse(100)
		self:SetTeleportOffsetVec(Vector(0, 0, 0))
		self:SetTeleportOffsetAng(Angle(0, 0, 0))


		EZDoor:SaveData()
	end

	function ENT:Use(activator)
		local distSqr = self:GetDistanceToUse() * self:GetDistanceToUse()
		local isInRange = activator:GetPos():DistToSqr(self:GetPos()) < distSqr

		if isInRange then
			self:Teleport(activator)
		end
	end

	function ENT:Teleport(activator)
		if not self:HasSister() or activator:GetNWBool("isUsingDoor", false) then return end
		activator:SetNWBool("isUsingDoor", true)

		local timeToFade = self:GetTimeToEnter() / 2
		local holdTime = self:GetTimeToEnter() / 2

		-- Blind the player
		activator:ScreenFade(SCREENFADE.OUT, color_black, timeToFade, holdTime + 0.1)
		if #self:GetDoorSound() != 0 then
			self:EmitSound(self:GetDoorSound())
		end

		-- Teleport the player while we are blind
		timer.Simple(timeToFade, function()
			if not IsValid(activator) then return end
			if not IsValid(self) or not IsValid(EZDoor:FindByID(self:GetSister())) then
				activator:Respawn()
				return
			end

			timer.Simple(0, function()
				if activator:Name() == "Мита" then
					local dor = nil

					for k, v in ipairs( ents.FindByClass( "sent_ezdoor" ) ) do
						if v:GetDoorName() == "1.9" then
							dor = v
						end
					end

					activator:SetPos(EZDoor:FindByID(dor:GetSister()):TeleportVec())
					local physics = activator:GetPhysicsObject()
					physics:SetPos(EZDoor:FindByID(dor:GetSister()):TeleportVec(), true)
					local eyeAngles = Angle(EZDoor:FindByID(dor:GetSister()):TeleportAng().x, EZDoor:FindByID(dor:GetSister()):TeleportAng().y, 0)
					activator:SetEyeAngles(eyeAngles)
					activator:Freeze()
				else
					activator:SetPos(self:TeleportVec())
					local physics = activator:GetPhysicsObject()
					physics:SetPos(self:TeleportVec(), true)
					local eyeAngles = Angle(self:TeleportAng().x, self:TeleportAng().y, 0)
					activator:SetEyeAngles(eyeAngles)
					activator:Freeze()
				end
			end)
		end)

		-- Fade the character back to existance
		timer.Simple((timeToFade + holdTime), function()
			if not IsValid(activator) then return end
			if not IsValid(self) or not IsValid(EZDoor:FindByID(self:GetSister())) then
				activator:Respawn()
				return
			end

			activator:ScreenFade(SCREENFADE.IN, color_black, timeToFade, holdTime )
			activator:UnLock()

			activator:SetNWBool("isUsingDoor", false)
		end)
	end

	function ENT:OnRemove()
		if not EZDoor.ShuttingDown then
			-- Remove the sister of any ents connected
			if self:HasSister() then
				local sister = EZDoor:FindByID(self:GetSister())
				self:SetSister(0)
				if IsValid(sister) then
					sister:SetSister(0)
				end
			end

			EZDoor:SaveData()
		end
	end

	function ENT:Think()
		if self:GetUseTriggerBounds() and self:HasSister() then
			local centerPos = self:LocalToWorld(self:OBBCenter())
			for _, ent in ipairs(ents.FindInSphere(centerPos, self:GetDistanceToUse())) do
				if not ent:IsPlayer() then continue end

				self:Teleport(ent)
			end
		end
	end
else
	function ENT:Draw()
		self:DrawModel()
	end
end

hook.Add("PostDrawHUD", "DrawEZDoorName", function()
	local ent = LocalPlayer():GetEyeTrace().Entity
	if not IsValid(ent) then return end
	if ent:GetClass() != "sent_ezdoor" then return end
	if ent:GetDoorName() == "" then return end
	if LocalPlayer():GetNWBool("isUsingDoor", false) then return end

	local centerPos = ent:LocalToWorld(ent:OBBCenter()):ToScreen()
	local distSqr = (ent:GetDistanceToUse() * ent:GetDistanceToUse()) * 1.5
	local isInRange = LocalPlayer():GetPos():DistToSqr(ent:GetPos()) < distSqr

	if isInRange then
		draw.DrawText("", "Trebuchet24", centerPos.x, centerPos.y, color_white, TEXT_ALIGN_CENTER)
	end
end)