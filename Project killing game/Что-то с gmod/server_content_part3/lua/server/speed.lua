util.AddNetworkString("StopRunDDF")
util.AddNetworkString("StartRunDDF")
util.AddNetworkString("ReStartRunDDF")
util.AddNetworkString("SetPlayerFood")
util.AddNetworkString("SetPlayerWater")
util.AddNetworkString("SetPlayerSleep")
util.AddNetworkString("SetPlayerMaxStamina")

local CMoveData = FindMetaTable("CMoveData")

function CMoveData:RemoveKeys(keys)
  -- Using bitwise operations to clear the key bits.
  local newbuttons = bit.band(self:GetButtons(), bit.bnot(keys))
  self:SetButtons(newbuttons)
end


local single = true
hook.Add("SetupMove", "Disable Jumping", function(ply, mvd, cmd)
  if mvd:KeyDown(IN_JUMP) and mvd:KeyPressed(IN_JUMP) and ply:GetMoveType() ~= 8 and ply:OnGround() then
    if ply:GetNWFloat("PlayerStamina")>ply:GetNWFloat("PlayerMaxStamina")/4 then 
      if single then
        single = false
        ply:SetNWBool("RestartStamina", false)
        ply:SetNWFloat("PlayerStamina", ply:GetNWFloat("PlayerStamina")-ply:GetNWFloat("PlayerMaxStamina")/8 * ply:GetNWFloat("StaminaSpendScaler"))
        timer.Simple(0.1, function ()
          single = true
        end)
                timer.Simple(1, function ()
          ply:SetNWBool("RestartStamina", true)
        end)
      end
    else
      mvd:RemoveKeys(IN_JUMP)
    end
  end
end)

local function GetStaminaScaler(stamina)
    if stamina < 25 then
        stamina = (50+stamina*4) / 200
    elseif stamina < 50 then
        stamina = (50 + stamina) / 100
        else
        stamina = 1
        end
    return stamina
    end

local function SetSpeedForPlayer(ply)
    local plyHealth = ply:Health()
    if plyHealth <= 0 then
        plyHealth = 0.40
    elseif plyHealth < 50 then
      plyHealth = plyHealth /35
    else
      plyHealth = 1
    end
    if plyHealth < 0.25 then
      plyHealth = 0.25
    end
    local plyStamina = ply:GetNWFloat("PlayerStamina")
    plyStamina = GetStaminaScaler(plyStamina)
local speed = plyStamina * plyHealth * ply:GetNWFloat("PlayerSpeed") * (ply:GetNWFloat("PlayerFood") + 1)
    ply:SetWalkSpeed(speed/2*ply:GetNWFloat("WalkSpeedScaler"))
        ply:SetSlowWalkSpeed(speed/4*ply:GetNWFloat("SlowWalkSpeedScaler"))
        ply:SetJumpPower((speed-100)*2*ply:GetNWFloat("JumpPowerScaler"))
                ply:SetRunSpeed(speed*ply:GetNWFloat("RunSpeedScaler"))
    end

--[[hook.Add( "PlayerInitialSpawn", "RestoreHealthTimer", function( ply )

  ply:SetNWFloat("HealthRestoreScale",1)

  timer.Create("Restore Health "..ply:Name(), 10.0/ply:GetNWFloat("HealthRestoreScale"), 0, function () 
    print(10.0/ply:GetNWFloat("HealthRestoreScale"))
    if ply:Health() < 75 then
      ply:SetHealth(ply:Health()+1)
      SetSpeedForPlayer(ply)
   end
 end)

end)--]]



local tickskaler = 1.5
hook.Add("Tick","far",function()
--print(LocalPlayer():GetRunSpeed())
  for i,ply in pairs(player.GetAll()) do
            --print(ply:GetVelocity())
    --if ply:IsSuperAdmin() then
           SetSpeedForPlayer(ply)
      local localstaminalenght = ply:GetNWFloat("PlayerMaxStamina")  / (ply:GetNWFloat("PlayerWater") + 1)
      local stamina = ply:GetNWFloat("PlayerStamina")
             if stamina <=10 then 
                ply:SetNWBool("RestartStamina", true)
                end
      if ply:IsSprinting() and ply:GetMoveType() ~= 8 and ply:OnGround() and (ply:KeyDown( IN_FORWARD ) or ply:KeyDown( IN_MOVELEFT ) or ply:KeyDown( IN_MOVERIGHT ) or ply:KeyDown( IN_BACK )) then
        if stamina > -1 then
          stamina = stamina - localstaminalenght/200 * 1.5 * GetStaminaScaler(ply:GetNWFloat("PlayerStamina")) * 0.75 * tickskaler * ply:GetNWFloat("StaminaSpendScaler")
        end
      else
        if stamina < 200 then
                    local stayScaler = 1
                    local nullVector = Vector(0,0,0)
                    if ply:GetVelocity() == nullVector then
                        stayScaler = 2
                        end
                        if (ply:OnGround() or ply:GetMoveType() == 8) then

          stamina = stamina + (10/(ply:GetNWFloat("PlayerWater") + 1))/200 * GetStaminaScaler(ply:GetNWFloat("PlayerStamina")) * 0.75 * stayScaler * tickskaler * ply:GetNWFloat("StaminaRestoreScaler")
        end
        end
      end
      ply:SetNWFloat("PlayerStamina", stamina)
            if stamina < 50 then
            SetSpeedForPlayer(ply)
                end
    end
  --end
end)


local function Spawn( ply )
    ply:SetNWFloat("PlayerStamina", 200)
end
hook.Add( "PlayerSpawn", "some_unique_name", Spawn )



net.Receive("SetPlayerWater", function ()
    local ply = net.ReadEntity()
    local water = net.ReadFloat()
    ply:SetNWFloat("PlayerWater", water)
    end)

net.Receive("SetPlayerSleep", function ()
    local ply = net.ReadEntity()
    local sleep = net.ReadFloat()
    ply:SetNWFloat("PlayerSleep", sleep)
    end)

net.Receive("SetPlayerMaxStamina", function ()
    local ply = net.ReadEntity()
    local maxstamina = net.ReadFloat()
    ply:SetNWFloat("PlayerNormalMaxStamina", maxstamina)
    ply:SetNWFloat("PlayerMaxStamina", maxstamina)
    end)

net.Receive("SetPlayerFood", function ()
    local ply = net.ReadEntity()
    local food = net.ReadFloat()
    ply:SetNWFloat("PlayerFood", food)
SetSpeedForPlayer(ply)

  end)

hook.Add( "PostEntityTakeDamage", "AntiTeamkill", function( ply)
  if ply:IsPlayer() then
SetSpeedForPlayer(ply)
end
end )

net.Receive("StopRunDDF",function()
        local ply = net.ReadEntity()
        --local speed = ply:GetNWFloat("PlayerSpeed")/2
            local plyHealth = ply:Health()
            if plyHealth < 50 then
      plyHealth = plyHealth /50
    else
      plyHealth = 1
    end
        local speed = (plyHealth * ply:GetNWFloat("PlayerSpeed") * (ply:GetNWFloat("PlayerFood") + 1))/2
        if(ply:IsValid()) then
            ply:SetWalkSpeed(speed/2*ply:GetNWFloat("WalkSpeedScaler"))
            ply:SetRunSpeed(speed/2*ply:GetNWFloat("RunSpeedScaler"))
            ply:SetSlowWalkSpeed(speed/4*ply:GetNWFloat("SlowWalkPowerScaler"))
            ply:SetJumpPower((speed-100)*2*ply:GetNWFloat("JumpPowerScaler"))
         end
    --    ply:SetDuckSpeed(40)
    --    ply:SetCrouchedWalkSpeed(40)
      --  ply:SetSlowWalkSpeed(40)

        --ply:StopSprinting()
        --ply:SprintDisable()
        --print(ply)

    end)
net.Receive("StartRunDDF",function()
        local ply = net.ReadEntity()
        local speed = net.ReadFloat()
        ply:SetNWFloat("PlayerSpeed", speed)
        if(ply:IsValid()) then
        ply:SetWalkSpeed(speed/2*ply:GetNWFloat("WalkSpeedScaler"))
        ply:SetSlowWalkSpeed(speed/4*ply:GetNWFloat("SlowWalkScaler"))
        ply:SetJumpPower((speed-100)*2*ply:GetNWFloat("JumpPowerScaler"))
     --   ply:SetDuckSpeed(40)
     --   ply:SetCrouchedWalkSpeed(40)
       -- ply:SetSlowWalkSpeed(40)

        ply:SetRunSpeed(speed*ply:GetNWFloat("RunSpeedScaler"))
        end
        --ply:SprintEnable()
        --print(ply)


    end)
net.Receive("ReStartRunDDF",function()
        local ply = net.ReadEntity()
        --local speed = ply:GetNWFloat("PlayerSpeed")
local plyHealth = ply:Health()
            if plyHealth < 50 then
      plyHealth = plyHealth /50
    else
      plyHealth = 1
    end
        local speed = (plyHealth * ply:GetNWFloat("PlayerSpeed") * (ply:GetNWFloat("PlayerFood") + 1))
        --ply:SetNWFloat("PlayerSpeed", speed)
        ply:SetWalkSpeed(speed/2*ply:GetNWFloat("WalkSpeedScaler"))
        ply:SetSlowWalkSpeed(speed/4*ply:GetNWFloat("SlowWalkSpeedScaler"))
        ply:SetJumpPower((speed-100)*2*ply:GetNWFloat("JumpPowerScaler"))
     --   ply:SetDuckSpeed(40)
     --   ply:SetCrouchedWalkSpeed(40)
       -- ply:SetSlowWalkSpeed(40)

        ply:SetRunSpeed(speed*ply:GetNWFloat("RunSpeedScaler"))
        --ply:SprintEnable()
        --print(ply)


    end)

-- gmsave.LoadMap("dgrv3_ultimateacademy 2021-3-9 20-56-02.gms")
   -- print ("hi")
  --  for k,v in pairs(player.GetAll()) do 
      -- gmsave.LoadMap(gmsave.PlayerSave(v)[1])
   --     print(gmsave.SaveMap(v))
  --  end
print("Server speed saved")