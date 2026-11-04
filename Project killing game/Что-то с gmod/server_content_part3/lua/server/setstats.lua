util.AddNetworkString("SendStats")
util.AddNetworkString("SendMana")

local function SetupStats(ply)
        ply:SetNWFloat("RunSpeedScaler", 1)
        ply:SetNWFloat("JumpPowerScaler", 1)
        ply:SetNWFloat("SlowWalkSpeedScaler", 1)
        ply:SetNWFloat("WalkSpeedScaler", 1)
        ply:SetNWFloat("FoodScaler", 1)
        ply:SetNWFloat("WaterScaler", 1)
        ply:SetNWFloat("SleepScaler", 1)
        ply:SetNWFloat("StaminaRestoreScaler", 1)
        ply:SetNWFloat("StaminaSpendScaler", 1)
        ply:SetNWBool("FallDamage", true)
        ply:SetNWFloat("HandDamage", 0)
        ply:SetNWFloat("DamageResistance", 1)
        ply:SetNWFloat("StrDiceAdd", 0)
        ply:SetNWFloat("DexDiceAdd", 0)
        ply:SetNWFloat("IntDiceAdd", 0)
        ply:SetNWFloat("HealthRestoreScale", 1)
        ply:SetNWString("EngrammaOf", "")
        ply:SetNWFloat("CurrentCyberpsychosis", -1)
        ply:SetNWFloat("MaxCyberpsychosis", 0)
        ply:SetNWFloat("CanSeeEverybodyInRange", 0)
        ply:SetNWString("CanSeeOnePerson", "")
        ply:SetNWFloat("ObservationAdd", 0)
end

timer.Create("Restore Cyberpsychosis", 10, 0, function () 
    for i,ply in pairs(player.GetAll()) do
        --if ply:GetNWFloat("CurrentCyberpsychosis") < ply:GetNWFloat("MaxCyberpsychosis") then

            ply:SetNWFloat("CurrentCyberpsychosis", ply:GetNWFloat("CurrentCyberpsychosis") + ply:GetNWFloat("MaxCyberpsychosis")/360.0)

        --end
        --if ply:GetNWFloat("CurrentCyberpsychosis") > ply:GetNWFloat("MaxCyberpsychosis") then

          --  ply:SetNWFloat("CurrentCyberpsychosis", ply:GetNWFloat("CurrentCyberpsychosis") - ply:GetNWFloat("MaxCyberpsychosis")/360.0)
         --   print(ply:GetNWFloat("CurrentCyberpsychosis"))
        -- end
    end
end) 

hook.Add("PlayerInitialSpawn", "Join", function (ply)
    SetupStats(ply)
	end)

for i,ply in pairs(player.GetAll()) do
        SetupStats(ply)
    end

net.Receive ('SendStats', function()
local ply = net.ReadEntity()
local stats = net.ReadTable()
        ply:SetNWFloat("RunSpeedScaler", tonumber(stats[1]))
        ply:SetNWFloat("JumpPowerScaler", tonumber(stats[2]))
        ply:SetNWFloat("SlowWalkSpeedScaler", tonumber(stats[3]))
        ply:SetNWFloat("WalkSpeedScaler", tonumber(stats[4]))
        ply:SetNWFloat("FoodScaler", tonumber(stats[5]))
        ply:SetNWFloat("WaterScaler", tonumber(stats[6]))
        ply:SetNWFloat("SleepScaler", tonumber(stats[7]))
        ply:SetNWFloat("StaminaRestoreScaler", tonumber(stats[8]))
        ply:SetNWFloat("StaminaSpendScaler", tonumber(stats[9]))
        ply:SetNWBool("FallDamage", stats[10])
        ply:SetNWFloat("HandDamage", tonumber(stats[11]))
        ply:SetNWFloat("DamageResistance", tonumber(stats[12]))
        ply:SetNWFloat("StrDiceAdd", tonumber(stats[13]))
        ply:SetNWFloat("DexDiceAdd", tonumber(stats[14]))
        ply:SetNWFloat("IntDiceAdd", tonumber(stats[15]))
        ply:SetNWFloat("HealthRestoreScale", tonumber(stats[16]))
        ply:SetNWString("EngrammaOf", stats[17])
        ply:SetNWFloat("CurrentCyberpsychosis", tonumber(stats[18]))
        ply:SetNWFloat("MaxCyberpsychosis", tonumber(stats[19]))
        ply:SetNWFloat("CanSeeEverybodyInRange", tonumber(stats[20]))
        ply:SetNWString("CanSeeOnePerson", stats[21])
        ply:SetNWString("ObservationAdd", tonumber(stats[22]))
if ply:GetNWString("EngrammaOf") ~= "" then
    ply:SetCustomCollisionCheck(true)
elseif ply:GetNWString("EngrammaOf") == "" then
    ply:SetCustomCollisionCheck(false)
end
end)

hook.Add( "ShouldCollide", "EngrammaCollision", function( ent1, ent2 )
    if ( ent1:GetNWString("EngrammaOf") ~= ""  or ent2:GetNWString("EngrammaOf") ~= ""  ) then return false end
end )

net.Receive ('SendMana', function(len,ply)
    local mana = net.ReadFloat()
    ply:SetNWFloat("CurrentCyberpsychosis", ply:GetNWFloat("CurrentCyberpsychosis")-mana)
    local Say = {}
    table.Add(Say, {Color(255, 0, 0), ply:Nick() .. " потратил " .. mana .. " маны."} )
    for k, v in ipairs( player.GetAll() ) do
        if v:IsSuperAdmin() then
            net.Start("SendLocalMessage")
            net.WriteTable(Say)
            net.Send(v)
        end
    end
end)

print('setStats has been loaded')