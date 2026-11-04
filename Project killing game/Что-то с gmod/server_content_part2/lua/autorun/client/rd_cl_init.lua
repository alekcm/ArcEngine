/*  This script is ran on all clients (also on the listen-server client).
    This handles the registering and sending of the of the console commands
    needed for the clients and the authority client, and also calculates the 
    first-person view when a player died and has the option enabled.
*/
    

if SERVER then return end

-------------------------
--  Per-Client ConVars --
-------------------------
CreateClientConVar("rd_firstperson", "1", true, false, "Enter the ragdolls point of view when dead")
CreateClientConVar("rd_firstperson_nearclip", "1", true, false, "Higher values work better with masks", 0.01, 5)
CreateClientConVar("rd_firstperson_force", "0", true, false, "Always go into first person even when the model isn't supported")

--------------------------
--  Admin-only ConVars  --
--------------------------
CreateConVar("rd_enable",           "1",    {FCVAR_ARCHIVE, FCVAR_UNREGISTERED})
CreateConVar("rd_blood",            "1",    {FCVAR_ARCHIVE, FCVAR_UNREGISTERED})
CreateConVar("rd_blood_threshold",  "500",  {FCVAR_ARCHIVE, FCVAR_UNREGISTERED})
CreateConVar("rd_playercollide",    "1",    {FCVAR_ARCHIVE, FCVAR_UNREGISTERED})
CreateConVar("rd_keepmax",          "2",    {FCVAR_ARCHIVE, FCVAR_UNREGISTERED})
CreateConVar("rd_timeremove",       "120",  {FCVAR_ARCHIVE, FCVAR_UNREGISTERED})
CreateConVar("rd_weight_multiplier","1",    {FCVAR_ARCHIVE, FCVAR_UNREGISTERED})


----------------
--  Variables --
----------------

local Enabled = true            -- Stores whether the server has enabled the addon

local ownedRagdollIndex         -- Stores the player's ragdoll's Entity Index

local LocalRagdoll = nil        -- Stores the player's ragdoll entity
                                -- Stores whether the first-person camera is enabled

local queuedRagdolls = {}       -- Stores the Entity Indices of the ragdolls that
                                -- don't exists on the client yet
local FirstPersonEnabled = GetConVar("rd_firstperson"):GetBool()

local eyeAttachmentIndex = nil
local headBoneIndex = nil
------------------------
--  First person view --     
------------------------

hook.Add("CalcView","RagDeath_Cam",function(ply, pos, angles, fov)
if Enabled then
    if LocalPlayer():Alive() then return end
    if not IsValid(LocalRagdoll) then return end
    local ent = GetViewEntity()
    if ent!=LocalPlayer() then return end
    if not FirstPersonEnabled or ((not eyeAttachmentIndex) and (not headBoneIndex)) then 
        local rd = util.TraceLine({start=LocalRagdoll:GetPos(),endpos=LocalRagdoll:GetPos()-angles:Forward()*105,filter={LocalRagdoll,LocalPlayer()}})
        return {origin=LocalRagdoll:GetPos()-angles:Forward()*(100*rd.Fraction),angles=angles,fov=fov,znear=0.5} 
    end
    local view = {}
    

    local head = {Pos = LocalRagdoll:EyePos(),
                  Ang = LocalRagdoll:EyeAngles()}

    if eyeAttachmentIndex then 
        head = LocalRagdoll:GetAttachment( eyeAttachmentIndex )
    elseif headBoneIndex then
         local boneMatrix = LocalRagdoll:GetBoneMatrix(headBoneIndex)
         head.Pos = LocalRagdoll:GetBonePosition(headBoneIndex)
         head.Ang = boneMatrix:GetAngles()
    end

   
    view.origin = head.Pos
    view.angles = head.Ang
    view.fov = fov
    view.znear = GetConVar("rd_firstperson_nearclip"):GetFloat()
    
    return view
end
end)


---------------------
-- Server messages --
---------------------

--  Toggles the addon   
net.Receive("ragdeath_enabled_to_client",function()
    Enabled = net.ReadBool()
    if not Enabled then
        LocalRagdoll = NULL
    end
end)


-- Called when a ragdoll is created. Stores the entity index and the owner.
-- The ragdoll doesn't exist for the client yet, so we have to store the info
-- and wait for the ragdoll to appear in the NetworkEntityCreated hook.

net.Receive("ragdeath_client",function()
    local entityIndex = net.ReadInt(32)
    local playerIndex = net.ReadInt(32)
    local ply = ents.GetByIndex(playerIndex)
    table.insert(queuedRagdolls, 1, {index = entityIndex, owner = ply})
end)


-------------------
-- Ragdoll setup --
-------------------

-- Called when the ragdoll is created for the client
hook.Add("NetworkEntityCreated","RagDeath_Setup",function(ent)
    -- Check if the entity was one of the queued ragdolls
    if #queuedRagdolls == 0 then return end 

    -- Here we check if any of the entity indices received in the
    -- "ragdeath_client" net message match the entity that was just created
    
    local owner = NULL 
    local isQueuedRagdoll = false -- Loop through all queued ragdoll indices

    for i, ent_info in pairs(queuedRagdolls) do 
        if ent_info["index"] == ent:EntIndex() then
            -- Entity matches one of the queued ragdolls. Store the owner and exit the loop
            isQueuedRagdoll = true
            owner = queuedRagdolls[i].owner
            table.remove(queuedRagdolls, i)
            break
        end
    end
    if owner == nil then return end
    if not isQueuedRagdoll then return end -- The entity wasn't a ragdoll, exit

    -- Set the color from the player to the ragdoll
    local plyColor = owner:GetPlayerColor()
    ent.GetPlayerColor = function() return plyColor end

    -- Do the same for the weapon color (if some model uses it)
    local weaponColor = owner:GetWeaponColor()
    ent.GetWeaponColor = function() return weaponColor end

    -- Check if the ragdoll owner is this player. If so, we can go into first-person view
    if owner == LocalPlayer() then
        LocalRagdoll = ent

        -- Find eye viewpoint for first-person
        eyeAttachmentIndex = nil
        headBoneIndex = nil
        ent:SetupBones()
        eyeAttachmentIndex = LocalRagdoll:LookupAttachment( "eyes" )
        if eyeAttachmentIndex <= 0 then
            eyeAttachmentIndex = nil
            if GetConVar("rd_firstperson_force"):GetBool() then
                for i=0, ent:GetBoneCount()-1, 1 do
                    local name = LocalRagdoll:GetBoneName(i)
                    if not name then continue end
                    if name ==  "__INVALIDBONE__" then continue end
                    if string.find(name:lower(), "head") then
                        headBoneIndex = i
                        break
                    end
                end
            end
        end
    end
end)    


----------------
--  Tool menu --    
----------------

hook.Add( "PopulateToolMenu", "RagDeath_CustomMenuSettings", function()

    -- User settings
    spawnmenu.AddToolMenuOption("Utilities", "User", "RagDeath_Client", "RagDeath", "", "", function( panel )
        panel:CheckBox( "First-Person View", "rd_firstperson")
        panel:NumSlider( "First-Person Clip Distance", "rd_firstperson_nearclip",0.1,5,2)
        
        panel:CheckBox( "First-Person with Unsupported Playermodels", "rd_firstperson_force")
    end )

    -- Admin settings
    spawnmenu.AddToolMenuOption( "Utilities", "Admin", "RagDeath_Server", "RagDeath", "", "", function( panel )
        panel:CheckBox( "Enable", "rd_enable")
        panel:CheckBox( "Collidable with Players", "rd_playercollide")
        panel:CheckBox( "Blood", "rd_blood")
        panel:NumSlider( "Blood Threshold", "rd_blood_threshold",10,1000,0)
        panel:NumSlider( "Max ragdolls for a player", "rd_keepmax", 0, 10, 0)
        panel:NumSlider( "Ragdoll removal time", "rd_timeremove", 0, 3600, 0)
        panel:NumSlider( "Ragdoll bone weight multiplier", "rd_weight_multiplier", 0, 500, 0)

    end )
end )


-------------
-- Convars --
-------------

-- Sends admin console commands to the server

local function SendConvarToServer(ConVarName, old, new)
    if not LocalPlayer():IsAdmin() then
        LocalPlayer():ChatPrint("You must be an admin to do change the value of " .. ConVarName)
        return
    end
    net.Start("ragdeath_server_convar")
        net.WriteString(ConVarName)
        net.WriteString(new)
    net.SendToServer()
end


--------------------------------
--  Console command callbacks --
--------------------------------

cvars.AddChangeCallback( "rd_firstperson", function(convar, old, new)
    FirstPersonEnabled = tobool(new)
end) 


cvars.AddChangeCallback("rd_enable", function(convar, old, new)
	SendConvarToServer(convar, old, new)
end)

cvars.AddChangeCallback("rd_blood", function(convar, old, new)
	SendConvarToServer(convar, old, new)
end)

cvars.AddChangeCallback("rd_playercollide", function(convar, old, new)
	SendConvarToServer(convar, old, new)
end)

cvars.AddChangeCallback("rd_keepmax", function(convar, old, new)
	SendConvarToServer(convar, old, new)
end)

cvars.AddChangeCallback("rd_timeremove", function(convar, old, new)
	SendConvarToServer(convar, old, new)
end)

cvars.AddChangeCallback("rd_weight_multiplier", function(convar, old, new)
	SendConvarToServer(convar, old, new)
end)
