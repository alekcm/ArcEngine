if CLIENT then return end


-- Network Strings:

util.AddNetworkString("ragdeath_client")

util.AddNetworkString("ragdeath_server_convar")
util.AddNetworkString("ragdeath_enabled_to_client")

--------------------
-- Server ConVars --
--------------------

local MaxRagdollsVar = CreateConVar("rd_keepmax","2",FCVAR_ARCHIVE,"", 1)
local LifetimeVar = CreateConVar("rd_timeremove","120", FCVAR_ARCHIVE,"")
local CollidePlayersVar = CreateConVar("rd_playercollide","1", FCVAR_ARCHIVE,"")
local AllowBloodVar = CreateConVar("rd_blood", "1", FCVAR_ARCHIVE,"")
local BloodThresholdVar = CreateConVar("rd_blood_threshold", "500", FCVAR_ARCHIVE,"")
local RagDeathEnabledVar = CreateConVar("rd_enable", "1", {FCVAR_ARCHIVE,FCVAR_GAMEDLL,FCVAR_REPLICATED,FCVAR_PROTECTED}, "")
local WeightMulVar = CreateConVar("rd_weight_multiplier", "1", FCVAR_ARCHIVE,"")


----------------
--  Variables --
----------------

local DeathRagdolls = {} -- Stores an array of ragdolls for all players
						 -- Each player may have more than 1 ragdoll



------------------
-- Blood decals --
------------------

-- Called when ragdolls collide with something. Adds blood decals
local function OnRagdollCollide(collider, colData  )	
	if AllowBloodVar:GetBool() then
		if colData.Speed < BloodThresholdVar:GetFloat() then return end
		local pos = colData.HitPos
		local norm = colData.OurOldVelocity:GetNormalized()
		util.Decal("Blood",pos,pos + colData.HitNormal * 20)
	end
end


----------------------------
----- Helper functions -----
----------------------------


-- Removes all ragdolls belonging to the given player
-- Removes the player from the DeathRagdolls table
local function RemovePlayerRagdolls(ply)
	if not DeathRagdolls[ply] then return end
	for index, ragdoll in pairs(DeathRagdolls[ply]) do
		if IsValid(ragdoll) then
			ragdoll:Remove()
		end
	end
	table.Empty(DeathRagdolls[ply])
	DeathRagdolls[ply] = nil
end


-- Removes all ragdolls by calling RemovePlayerRagdolls for all players
local function RemoveAllRagdolls()
	for ply in pairs(DeathRagdolls) do
		RemovePlayerRagdolls(ply)
	end
end

local function EnableServerRagdolls()
	for ply in pairs(DeathRagdolls) do
		ply:SetShouldServerRagdoll(true)
	end
end

-- Loops through the given ragdolls bones and multiplies the mass with the multiplier
-- If multiplier is 0, disables gravity for the bones
local function ApplyWeightMultiplier(rag, mul)
	for i=0, rag:GetPhysicsObjectCount()-1 do
		local phys = rag:GetPhysicsObjectNum(i)
		if mul == 0 then
			phys:EnableGravity(false)
		else
			phys:SetMass(phys:GetMass()*mul)
		end
	end
end
------------------------
-- Main functionality --
------------------------

-- This hook is called when the ragdoll is automatically created by GMod
hook.Add("CreateEntityRagdoll","RagDeath_Ragdoll",function(owner, rag)
	if type(owner) != "Player" then return end
	-- Send the ragdolls entity index to its owner player
	local index = rag:EntIndex()
	net.Start("ragdeath_client")
		net.WriteInt(rag:EntIndex(),32)
		net.WriteInt(owner:EntIndex(),32)
	net.Broadcast()

	-- Add a new empty ragdoll list for the player if they don't already have one
	if not DeathRagdolls[owner] then 
		DeathRagdolls[owner] = {}
	end

	-- Keep removing old ragdolls until we have the maximum
	while #DeathRagdolls[owner]+1 > math.max(MaxRagdollsVar:GetInt(),1) do
		-- Get the last element in the array
		local index = #DeathRagdolls[owner]
		local oldestRagdoll = DeathRagdolls[owner][index]
		-- Destroy the ragdoll
		if IsValid(oldestRagdoll) then oldestRagdoll:Remove() end
		table.remove(DeathRagdolls[owner],index)
	end
	table.insert(DeathRagdolls[owner], 1, rag)
	


	-- Set the collision group to ignore players if the convar is set
	local group = COLLISION_GROUP_NONE
	if not CollidePlayersVar:GetBool() then
		group = COLLISION_GROUP_PASSABLE_DOOR
	end
	rag:SetCollisionGroup(group)
	local weightMultiplier = WeightMulVar:GetFloat()
	ApplyWeightMultiplier(rag, weightMultiplier)
	
	-- Remove owner (Otherwise owning player won't collide with the ragdoll)
	local matsPly = rag:GetOwner():GetMaterials()
	for i=1, #matsPly do
		local matPly = rag:GetOwner():GetSubMaterial(i)
		rag:SetSubMaterial(i,matPly)
	end
    rag:SetOwner(NULL )

	-- Enable tool interactions
	rag.CanConstrain = true
	rag.GravGunPunt = true
	rag.PhysgunDisabled = false

	-- Add callback for blood decals
	rag:AddCallback( "PhysicsCollide", OnRagdollCollide)
	
	-- Create a timer to remove the ragdoll
	local lifetime = math.max(LifetimeVar:GetInt(),0)
	if lifetime>0 then
	  timer.Simple(lifetime,function() if IsValid(rag) then rag:Remove() end end)
	end

end)


-- Called when a player dies. Removes the default ragdoll
hook.Add("PostPlayerDeath","RagDeath_PlayerDeath", function(ply)
	if not RagDeathEnabledVar:GetBool() then return end  -- Stop if the addon isn't enabled
	local defaultRagdoll = ply:GetRagdollEntity()
	if ( defaultRagdoll && defaultRagdoll:IsValid() ) then defaultRagdoll:Remove() end
end)


-- Simply enables the serverside ragdolls for a player.
hook.Add("PlayerSpawn","RagDeath_PlayerSpawn", function(ply)
	ply:SetShouldServerRagdoll(RagDeathEnabledVar:GetBool())
end)


-- Called when a player leaves. Removes all of their ragdolls
hook.Add( "PlayerDisconnected", "RagDeath_PlayerDisconnected", function( ply )
	RemovePlayerRagdolls(ply)
end )



----------------------
-- Console commands --
----------------------

-- Called when the addon is enabled or disabled
cvars.AddChangeCallback("rd_enable", function()
	local newEnabled = GetConVar("rd_enable"):GetBool()
	if newEnabledt then
		EnableServerRagdolls()
	end
	-- Notify in chat
	PrintMessage(HUD_PRINTTALK,"RagDeath " .. ( ( newEnabled ) and "enabled" or "disabled" ) )
	-- Also send the new addon state to the clients
	-- (Replicated convars dont trigger the convar callback on clients,
	-- so this is a workaround)
	net.Start("ragdeath_enabled_to_client")
	net.WriteBool(newEnabled)
	net.Send(player.GetAll())
	RemoveAllRagdolls()

end)

net.Receive("ragdeath_server_convar", function(len,ply)
	local convar_name = net.ReadString()
	local convar_value = net.ReadString()
	if not ply:IsAdmin() then 
		ply:ChatPrint("You must be an admin to do change the value of " .. convar_name)
		return 
	end
	convar = GetConVar(convar_name)
	convar:SetString(convar_value)
end)

