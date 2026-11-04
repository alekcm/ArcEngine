
if ( SERVER ) then
    
	AddCSLuaFile ()

end

if CLIENT then
    
    killicon.Add("yuji", "yuji/chibi", Color(255, 255, 255))
    SWEP.WepSelectIcon = surface.GetTextureID( "yuji/chibi_2" )
end

SWEP.PrintName = "Yuji (Shinjuku)"
SWEP.Author = "minwool"
SWEP.Instructions = "brother of many"

SWEP.Category  = "DDF Kaisen"
SWEP.Spawnable = true
SWEP.AdminOnly = false

SWEP.HoldType = "normal"
SWEP.UseHands = true

SWEP.ViewModel = 'models/weapons/c_arms_citizen.mdl'
SWEP.WorldModel = ''

SWEP.Primary.ClipSize = -1
SWEP.Primary.DefaultClip = -1
SWEP.Primary.Automatic = false
SWEP.Primary.Ammo = "none"

SWEP.Secondary.ClipSize = -1
SWEP.Secondary.DefaultClip = -1
SWEP.Secondary.Automatic = false
SWEP.Secondary.Ammo = "none"

SWEP.defaultHoldType = "Normal"

function SWEP:Initialize()
    self:SetHoldType(self.defaultHoldType)
    local ply = self:GetOwner()

    if SERVER and IsValid(ply) then
        ply:SetNWBool("yuji_equipped", false)
    end
    
end

SWEP.maxHP = 10000

-- normals
SWEP.barrage = false
SWEP.heavy = false 
SWEP.lunge = false
SWEP.dj = false

-- specials

-- cursed energy / None
SWEP.divergent_fist = false 
SWEP.timing_punch = false 
SWEP.simple_domain = false

-- Blood Manipulation
SWEP.piercing    = false
SWEP.piercing_cd = false
SWEP.blood_slice = false
SWEP.piercing_active = false
SWEP.piercing_projectile = false
SWEP.piercing_display = false

--Shrine
SWEP.yj_cleave = false 
SWEP.soul_dismantle = false 

hook.Add("PlayerSpawn", "yuji_InitializePlayerVariable", function(ply)
    if IsValid(ply) then

        ply:SetNWBool("yuji_equipped", false)
        ply:SetNWBool("yuji_shift", false) 
        ply:SetNWBool("yuji_zone", false) 
        ply:SetNWBool("yj_debounce", false)

        ply:SetNWInt("yj_mode", 0) -- 0: phys, 1: blood, 2: shrine

        ply:SetNWInt("yuji_zone_meter", 120)
        ply:SetNWInt("yuji_pity", 120)
        ply:SetNWInt("yuji_piercing", 100)

    end
end)

function SWEP:DrawHUD()
  
    if not CLIENT then return end

    local ply = LocalPlayer()

    local mode 
    local color

    if ply:GetNWInt("yj_mode") == 2 then
        mode = "Shrine"
        color = Color(255,0,119)
    elseif ply:GetNWInt("yj_mode") == 1 then
        mode = "Blood Manipulation"
        color = Color(191,0,38)
    else
        mode = "Cursed Energy"
        color = Color(41,202,255)

    end

    if mode == "Shrine" then
        draw.SimpleText("Cursed Technique: Shrine", "GModNotify", 60, 130, color, TEXT_ALIGN_LEFT, TEXT_ALIGN_TOP)
    elseif mode == "Blood Manipulation" then
        draw.SimpleText("Cursed Technique: Blood Manipulation", "GModNotify", 60, 130, color, TEXT_ALIGN_LEFT, TEXT_ALIGN_TOP)

    else
        draw.SimpleText("Cursed Technique: None", "GModNotify", 60, 130, Color(255,120,192), TEXT_ALIGN_LEFT, TEXT_ALIGN_TOP)

    end      

    draw.SimpleText("[ALT] - Switch Techniques", "GModNotify", 60, 160, Color(255,0,64), TEXT_ALIGN_LEFT, TEXT_ALIGN_TOP)

    local health = ply:Health()
    local maxHealth = self.maxHP

    local barWidth = 500
    local barHeight = 20
    local barX = 60
    local barY = ScrH() - 830
    local healthPercentage = health / maxHealth

    local healthText = "Health: " .. health .. " / " .. maxHealth

    surface.SetFont("ScoreboardDefault")
    local textWidth, textHeight = surface.GetTextSize(healthText)
    surface.SetDrawColor(255, 83, 235, 110)
    surface.DrawRect(barX, barY, barWidth, barHeight)
    surface.SetDrawColor(Color(255,120,240))
    surface.DrawRect(barX, barY, barWidth * healthPercentage, barHeight)

    surface.SetTextColor(Color(255, 255, 255))
    surface.SetTextPos(barX + 10 / 2, barY - textHeight + 21)
    surface.DrawText(healthText)

    -- meter

    if ply:GetNWBool("yuji_zone") then-- zone meter

        local max_zone = 120
    
        local barWidth = 500
        local barHeight = 15
        local barX = 60
        local barY = ScrH() - 810

        local cePercent = ply:GetNWInt("yuji_zone_meter")  / max_zone
    
        local text = "AWAKENED"
    
        surface.SetFont("CenterPrintText")
        local textWidth, textHeight = surface.GetTextSize(text)
        surface.SetDrawColor(255, 0, 0, 75)
        surface.DrawRect(barX, barY, barWidth, barHeight)
        surface.SetDrawColor(0, 0, 0)
        surface.DrawRect(barX, barY, barWidth * cePercent, barHeight)
    
        surface.SetTextColor(Color(255, 0, 0))
        surface.SetTextPos(barX + 10 / 2, barY - textHeight + 17)
        surface.DrawText(text)

        if self.piercing_display then
            local max_zone = 120
    
            local barWidth = 500
            local barHeight = 15
            local barX = 60
            local barY = ScrH() - 795

            local cePercent = ply:GetNWInt("yuji_piercing")  / 100
        
            local text = "Piercing Blood"
        
            surface.SetFont("CenterPrintText")
            local textWidth, textHeight = surface.GetTextSize(text)
            surface.SetDrawColor(226, 25, 62, 102)
            surface.DrawRect(barX, barY, barWidth, barHeight)
            surface.SetDrawColor(238, 35, 69)
            surface.DrawRect(barX, barY, barWidth * cePercent, barHeight)
        
            surface.SetTextColor(Color(255, 255, 255))
            surface.SetTextPos(barX + 10 / 2, barY - textHeight + 17)
            surface.DrawText(text)
        end
        return
    end

    if self.piercing_display then -- piercing blood
        local max_zone = 120

        local barWidth = 500
        local barHeight = 15
        local barX = 60
        local barY = ScrH() - 810

        local cePercent = ply:GetNWInt("yuji_piercing")  / 100
    
        local text = "Piercing Blood"
    
        surface.SetFont("CenterPrintText")
        local textWidth, textHeight = surface.GetTextSize(text)
        surface.SetDrawColor(255, 0, 0, 75)
        surface.DrawRect(barX, barY, barWidth, barHeight)
        surface.SetDrawColor(238, 35, 69)
        surface.DrawRect(barX, barY, barWidth * cePercent, barHeight)
    
        surface.SetTextColor(Color(255, 255, 255))
        surface.SetTextPos(barX + 10 / 2, barY - textHeight + 17)
        surface.DrawText(text)
    end
end

function SWEP:Melee(ply)

    if (self.barrage or !IsValid(ply)) then return end
    self.barrage = true

    local range = 400
    local damage = 50
    local cooldown = 3
    local hit = "minwool/jjk/hit.wav"
    local effect = "jjk_normal"

    if ply:GetNWBool("yuji_zone") then
        damage = damage*1.5
    end

    timer.Simple(cooldown, function() self.barrage = false end)

    self:SetHoldType("fist")
    timer.Simple(2, function() if IsValid(ply) then self:SetHoldType(self.defaultHoldType) end end)

    ply:SetAnimation(PLAYER_ATTACK1)

  
    timer.Create("vs_barrage_think", 0.1, 5, function()
        self:SetHoldType('fist')
        ply:SetAnimation(PLAYER_ATTACK1)
        ply:EmitSound("minwool/jjk/swing.wav", 340, math.random(100, 150), 1, CHAN_STATIC)

        local trace = util.TraceHull({
            start = ply:GetShootPos(),
            endpos = ply:GetShootPos() + (ply:GetAimVector() * range),
            filter = ply,
            maxs = {45,45,45},
            mins = {-45,-45,-45}
        })

        local entities = ents.FindInSphere(trace.HitPos, range)
        local lentities  = {} 
    
        for _, ent in ipairs(entities) do
            if IsValid(ent) and ent ~= ply and ( !ent:IsWorld() and ent:IsSolid() and !ent:GetNWBool("barrier") ) then
                table.insert(lentities, ent)
            end
        end
    
        for _, ent in ipairs(lentities) do
            if ( !IsValid(ent) or !SERVER ) then return end 
            ParticleEffect( effect, (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )
            ent:EmitSound(hit, 340, math.random(100,110), 1, CHAN_STATIC)
            ent:TakeDamage(damage, ply, self)
            util.ScreenShake(ply:GetPos(), 10, 40, 0.5, 600, true)

            if math.random(1, ply:GetNWInt("yuji_pity")) == 1 then -- black flash
                self:BlackFlash(ply, damage, lentities, trace)
                return
            end
        end
    end)

    timer.Simple(0.7, function()
        ply:EmitSound("minwool/jjk/heavy_swing.wav", 340, math.random(100, 150), 1, CHAN_STATIC)

        self:SetHoldType("melee")
        timer.Simple(0.3, function() if IsValid(ply) then self:SetHoldType(self.defaultHoldType) end end)
  
        ply:SetAnimation(PLAYER_ATTACK1)

        local trace = util.TraceHull({
            start = ply:GetShootPos(),
            endpos = ply:GetShootPos() + (ply:GetAimVector() * range),
            filter = ply,
            maxs = {45,45,45},
            mins = {-45,-45,-45}
        })

        local entities = ents.FindInSphere(trace.HitPos, range)
        local lentities  = {} 
    
        for _, ent in ipairs(entities) do
            if IsValid(ent) and ent ~= ply and ( !ent:IsWorld() and ent:IsSolid() and !ent:GetNWBool("barrier") ) then
                table.insert(lentities, ent)
            end
        end

        for _, ent in ipairs(lentities) do
            if ( !IsValid(ent) or !SERVER ) then return end 
            ParticleEffect( effect, (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )
            ent:EmitSound("minwool/jjk/heavy_hit.wav", 340, math.random(100,110), 1, CHAN_STATIC)
            ent:TakeDamage(damage*2, ply, self)
            util.ScreenShake(ply:GetPos(), 100, 40, 1, 600, true)

            if math.random(1, ply:GetNWInt("yuji_pity")) == 1 then -- black flash
                self:BlackFlash(ply, damage*2, lentities, trace)
                return
            end

            local phys = ent:GetPhysicsObject()

            local dir = (trace.HitPos - ply:GetPos()):GetNormalized()
            local force = 1500

            if IsValid(phys) then 
                phys:SetVelocity(dir * force) 

            end
            ent:SetVelocity(dir * force) 

        end
    end)
end

function SWEP:Lunge(ply)
    if !IsValid(ply) or self.lunge then return end
    self.lunge = true 

    local intensity = 1500
  
    ParticleEffect("dismantle_hit", ply:GetPos(), Angle(0,0,0), self)
    ply:EmitSound("minwool/jjk/double_jump.wav", 350, math.random(80,120), 1, CHAN_STATIC)
    ply:SetVelocity( ply:GetAimVector() * intensity )
end

function SWEP:CursedEnergy(ply, condition)
    if condition then -- divergent fist / misfire punch
        if self.divergent_fist then return end
        self.divergent_fist = true

        local damage = 150
        local range = 400
        local cooldown = 2

        local swing = "minwool/jjk/cursed_energy/heavy_swing.wav"
        local hit = "minwool/jjk/cursed_energy/heavyhit.wav"

        timer.Simple(cooldown, function()
            self.divergent_fist = false


        end)

        local trace = util.TraceHull({
            start = ply:GetShootPos(),
            endpos = ply:GetShootPos() + (ply:GetAimVector() * range),
            filter = ply,
            mins = {-45,-45,-45},
            maxs = {45,45,45}
          
        })
    
        local entities = ents.FindInSphere(trace.HitPos, 600)
        local lentities  = {} 
    
        for _, ent in ipairs(entities) do
            if IsValid(ent) and ent ~= ply and ( !ent:IsWorld() and ent:IsSolid() and !ent:GetNWBool("barrier") ) then
                table.insert(lentities, ent)
            end
        end
            
        self:SetHoldType('melee')
        ply:SetAnimation(PLAYER_ATTACK1)
        timer.Simple(1, function() if IsValid(ply) then self:SetHoldType(self.defaultHoldType) end end)
        ply:EmitSound("minwool/jjk/cursed_energy/equip.wav", 340, 100, 0.5, CHAN_STATIC)

        ply:EmitSound(swing, 340, math.random(90,100), 1, CHAN_STATIC)
        
        timer.Create("divergent_energy", 0, 20, function()
            if not IsValid(ply) then return end

            local hand  = ply:LookupBone("ValveBiped.Bip01_R_Hand")        
            local handPos = ply:GetBonePosition(hand)
    
            ParticleEffect( "ce_fist_energy", handPos, Angle(0,0,0), ply )

        end)
    
        timer.Simple(0.2, function()
    
            if #lentities > 0 then
    
                ParticleEffect( "ce_burst", trace.HitPos, Angle(0,0,0), ply )
    
            else return end
    
            for _, ent in ipairs(lentities) do
    
                if ( IsValid(ent) and SERVER ) then
                
                    util.ScreenShake( ply:GetPos(), 10, 40, 0.5, 100, true)
        
                    local phys = ent:GetPhysicsObject()
                    local dir = (ent:GetPos() - ply:GetPos()):GetNormalized()
                    local force = 10000
                
                    if IsValid(phys) then
                        if IsValid(phys) then phys:SetVelocity(dir * force) end

                    end
                    
                    ent:SetVelocity(dir * force)
                    ent:EmitSound(hit, 340, math.random(100, 120), 2, CHAN_STATIC)
                    ent:TakeDamage(damage, ply, self) 
                    
                    timer.Simple(0.4, function()
                        if IsValid(ent) then
                            ent:EmitSound("minwool/jjk/cursed_energy/aftershock.wav", 340, math.random(80, 100), 2, CHAN_STATIC)
                            ent:TakeDamage(damage*0.5, ply, self) 
                            ParticleEffect( "ce_surge", ent:GetPos() + Vector(0,0,40), Angle(0,0,0), self )

                        end
                    end)
                end
            end
         
        end)

        return
    end

    if self.timing_punch then return end
    self.timing_punch = true

    local damage = 100
    local range = 400
    local cooldown = 2

    local swing = "minwool/jjk/cursed_energy/heavy_swing.wav"
    local hit = "minwool/jjk/cursed_energy/hit.wav"

    timer.Simple(cooldown, function()
        self.timing_punch = false

    end)
  
    local trace = util.TraceHull({
        start = ply:GetShootPos(),
        endpos = ply:GetShootPos() + (ply:GetAimVector() * range),
        filter = ply,
        mins = {-45,-45,-45},
        maxs = {45,45,45}
      
    })

    local entities = ents.FindInSphere(trace.HitPos, 600)
    local lentities  = {} 

    for _, ent in ipairs(entities) do
        if IsValid(ent) and ent ~= ply and ( !ent:IsWorld() and ent:IsSolid() and !ent:GetNWBool("barrier") ) then
            table.insert(lentities, ent)
        end
    end
        
    self:SetHoldType('melee')
    ply:SetAnimation(PLAYER_ATTACK1)
    timer.Simple(1, function() if IsValid(ply) then self:SetHoldType(self.defaultHoldType) end end)

    ply:EmitSound(swing, 340, math.random(90,100), 1, CHAN_STATIC)
    
    timer.Simple(0.2, function()

        if #lentities > 0 then

            ParticleEffect( "ce_hit", trace.HitPos, Angle(0,0,0), ply )

            if math.random(1,10) == 1 then
                if SERVER then
                    self:BlackFlash(ply, damage, lentities, trace)
                    return
                end

            end

        else return end

        for _, ent in ipairs(lentities) do

            if ( IsValid(ent) and SERVER ) then
                
                util.ScreenShake( ply:GetPos(), 10, 40, 0.5, 100, true)

                ent:EmitSound(hit, 340, math.random(80, 100), 2, CHAN_STATIC)
                ent:TakeDamage(damage, ply, self) 
            end
        end
     
    end)
end

function SWEP:Convergence(ply, condition)
    if condition then
        if (self.blood_slice or !IsValid(ply)) then return end
        self.blood_slice = true
    
        local range = 200
        local damage = 75
        local cooldown = 2
    
        if ply:GetNWBool("yuji_zone") then
            damage = damage*1.5
        end
    
        timer.Simple(cooldown, function() self.blood_slice = false end)
    
        self:SetHoldType("fist")
        timer.Simple(1, function() if IsValid(ply) then self:SetHoldType(self.defaultHoldType) end end)
        ply:SetAnimation(PLAYER_ATTACK1)
        if SERVER then
            self.blood_spark = ents.Create("env_sprite")
            self.blood_light = ents.Create("light_dynamic")
        end
    
        if IsValid(self.blood_spark) then
            self.blood_spark:SetKeyValue("rendercolor", "255, 0, 0")
            self.blood_spark:SetKeyValue("HDRColorScale", "1")
            self.blood_spark:SetKeyValue("rendermode", "5")
            self.blood_spark:SetKeyValue("model", "minwool/jjk/effects/black_flash/sparks_stars.vmt")
            self.blood_spark:SetKeyValue("scale", "2")
      
            self.blood_light:SetKeyValue("brightness", "3")
            self.blood_light:SetKeyValue("distance", "200")
            self.blood_light:SetKeyValue("_light", "255, 0, 0")
    
            self.blood_spark:Spawn()
            self.blood_light:Spawn()
    
            self.blood_light:SetParent(self.blood_spark)
            self.blood_light:SetLocalPos(Vector(0,0,0))
    
            self.blood_spark:SetPos(ply:GetAimVector()*range)
          
            ply.blood_spark = self.blood_spark
            
            timer.Simple(0.5, function()
                self.blood_spark:Remove()
            end)
    
            timer.Create("debris", 0, 500, function()
                if !ply:Alive() then
                    if IsValid(ply.blood_spark) then
                        ply.blood_spark:Remove()
                    end
                end
            end)
        end
    
        timer.Create("vs_barrage_think", 0.1, 4, function()
            self:SetHoldType('fist')
            ply:SetAnimation(PLAYER_ATTACK1)
            ply:EmitSound("yuji/blood/swing.wav", 340, math.random(100, 150), 1, CHAN_STATIC)
            
            local trace = util.TraceHull({
                start = ply:GetShootPos(),
                endpos = ply:GetShootPos() + (ply:GetAimVector() * range),
                filter = ply,
                maxs = {45,45,45},
                mins = {-45,-45,-45}
            })
            if IsValid(self.blood_spark) then
                self.blood_spark:SetPos(trace.HitPos)
    
            end
            ParticleEffect( "blood_slice", trace.HitPos + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(-360,360),math.random(-360,360),math.random(-360,360)), ply )
    
            local entities = ents.FindInSphere(trace.HitPos, 600)
            local lentities  = {} 
        
            for _, ent in ipairs(entities) do
                if IsValid(ent) and ent ~= ply and ( !ent:IsWorld() and ent:IsSolid() and !ent:GetNWBool("barrier") ) then
                    table.insert(lentities, ent)
                end
            end
        
            for _, ent in ipairs(lentities) do
                if ( !IsValid(ent) or !SERVER ) then return end 
                ParticleEffect( "blood_hit", (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )
                ent:EmitSound("yuji/blood/slice_hit.wav", 340, math.random(100, 150), 1, CHAN_STATIC)
                ent:EmitSound("yuji/shrine/slash_hit.wav", 340, math.random(100, 150), 1, CHAN_STATIC)
    
                ent:TakeDamage(damage, ply, self)
                util.ScreenShake(ply:GetPos(), 10, 40, 0.5, 600, true)
            end
        end)
    
        timer.Simple(0.4, function()
            if IsValid(self.blood_spark) then
                self.blood_spark:SetPos(ply:GetAimVector()*range)
    
            end
    
            self:SetHoldType('melee')
            ply:SetAnimation(PLAYER_ATTACK1)
    
            ply:EmitSound("yuji/blood/swing.wav", 340, 80, 1, CHAN_STATIC)
            local trace = util.TraceHull({
                start = ply:GetShootPos(),
                endpos = ply:GetShootPos() + (ply:GetAimVector() * range),
                filter = ply,
                maxs = {45,45,45},
                mins = {-45,-45,-45}
            })
            ParticleEffect( "blood_slice", trace.HitPos + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(-360,360),math.random(-360,360),math.random(-360,360)), ply )
    
            local entities = ents.FindInSphere(trace.HitPos, range*1.5)
            local lentities  = {} 
        
            for _, ent in ipairs(entities) do
                if IsValid(ent) and ent ~= ply and ( !ent:IsWorld() and ent:IsSolid() and !ent:GetNWBool("barrier") ) then
                    table.insert(lentities, ent)
                end
            end
        
            for _, ent in ipairs(lentities) do
                if ( !IsValid(ent) or !SERVER ) then return end 
                ParticleEffect( "blood_hit", (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )
                ent:EmitSound("yuji/blood/slice_hit.wav", 340, 80, 1, CHAN_STATIC)
                ent:EmitSound("yuji/shrine/slash_hit.wav", 340, 80, 1, CHAN_STATIC)
    
                ent:TakeDamage(damage, ply, self)
                util.ScreenShake(ply:GetPos(), 10, 40, 0.5, 600, true)
    
                timer.Create("poison", 0.5, 10, function()
                    if !IsValid(ent) then return end
                    ent:TakeDamage(100, ply, self)
                    ent:EmitSound("yuji/blood/poison.wav", 350,  math.random(80, 120), 1, CHAN_STATIC)

                    ParticleEffect( "blood_hit", (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )
    
                end)
            
              
                
            end
        end)
        return
    end

    if self.piercing_cd then return end
    self.piercing_cd = true

    local damage = 50
    local ball_range = 50
    local cooldown = 5
    -- wind up
  
    ply:EmitSound("yuji/blood/piercing_blood_initial.wav", 450, 100, 1, CHAN_AUTO, SND_SHOULDPAUSE)
    self:SetHoldType("revolver")
   
  
    timer.Simple(0.5, function()
        self:SetHoldType("revolver")
        if SERVER then
            self.blood_ball = ents.Create("prop_dynamic")
            self.blood_ball_glow = ents.Create("env_sprite")
            self.pblood_light = ents.Create("light_dynamic")
            self.blood_piercer = ents.Create("prop_dynamic")
    
            if IsValid(self.blood_ball) and IsValid(self.blood_piercer) then
                
                self.blood_ball:SetModel("models/xqm/rails/gumball_1.mdl")
                self.blood_ball:SetMaterial("minwool/jjk/solid_glow")
                self.blood_ball:SetColor(Color(153, 16, 44, 241))
                self.blood_ball:SetRenderMode( RENDERMODE_TRANSALPHA )
                self.blood_ball:SetModelScale(0.2, 0.1)
                self.blood_ball:SetMoveType( MOVETYPE_NOCLIP )
                self.blood_ball:DrawShadow(false)
    
                self.blood_ball_glow:SetKeyValue("rendercolor", "200, 0, 50")
                self.blood_ball_glow:SetKeyValue("HDRColorScale", "1")
                self.blood_ball_glow:SetKeyValue("rendermode", "5")
                self.blood_ball_glow:SetKeyValue("model", "yuji/effects/blood/blood_end.vmt")
                self.blood_ball_glow:SetKeyValue("scale", "0.1")
    
                self.blood_piercer:SetModel("models/yuji/blood/piercer.mdl")
                self.blood_piercer:SetMaterial("yuji/effects/blood/bloodystream")
                self.blood_piercer:SetColor(Color(146, 146, 146, 244))
                self.blood_piercer:SetRenderMode( RENDERMODE_TRANSALPHA )
                self.blood_piercer:SetModelScale(0.1)
                self.blood_piercer:SetMoveType( MOVETYPE_NOCLIP )
                self.blood_piercer:DrawShadow(false)
    
                self.pblood_light:SetKeyValue("brightness", "3")
                self.pblood_light:SetKeyValue("distance", "200")
                self.pblood_light:SetKeyValue("_light", "255, 0, 0")
    
                self.blood_ball:Spawn()
                self.blood_piercer:Spawn()
                self.pblood_light:Spawn()
                self.blood_ball_glow:Spawn()
    
                self.pblood_light:SetParent(self.blood_piercer)
                self.pblood_light:SetLocalPos(Vector(0,0,0))
    
                self.blood_ball_glow:SetParent(self.blood_ball)
                self.blood_ball_glow:SetLocalPos(Vector(0,0,0))
    
                ply.blood_ball = self.blood_ball
                ply.blood_piercer = self.blood_piercer
    
                self.blood_ball:SetPos(ply:GetAimVector()*ball_range)
                self.blood_piercer:SetPos(ply:GetAimVector()*ball_range)
    
                local range = ball_range            
                
                local rope = constraint.Rope(self.blood_ball, self.blood_piercer, 0, 0, Vector(0, 0, 0), Vector(0, 0, 0), 100, 1000, 0, 4, "yuji/effects/blood/bloodystream", Color(255,255,255))
                util.ScreenShake(ply:GetPos(), 100, 30, 5, 2500, true)

                timer.Create("piercing_blood_windup", 0.01, 10, function()
                    if !IsValid(self.blood_ball) or !IsValid(self.blood_piercer) or self.piercing_projectile then return end
                    
                    if !ply:Alive() then
                        if IsValid(ply.blood_ball) then
                            ply.blood_ball:Remove()
                        end
                        if IsValid(ply.blood_piercer) then
                            ply.blood_piercer:Remove()
                        end
                        return
                    end
                  
                    range = range + 20

                    if IsValid(rope) then
                        rope:Remove()

                    end

                    local ball_trace = util.TraceLine({
                        start = ply:GetShootPos(),
                        endpos = ply:GetShootPos() + ( (ply:GetAimVector() + Vector(0,0,-0.3)) * ball_range ),
                        filter = ply
                    })
    
                    local trace = util.TraceLine({
                        start = ply:GetShootPos(),
                        endpos = ply:GetShootPos() + ( ply:GetAimVector() * range ),
                        filter = ply
                    })
    
                    self.blood_ball:SetPos(ball_trace.HitPos)
                    self.blood_piercer:SetPos(trace.HitPos)
                    self.blood_piercer:SetAngles(ply:EyeAngles())

                end)
                timer.Create("piercing_blood_particle_think", 0.05, 2000, function()
                    if !IsValid(self.blood_ball) or !IsValid(self.blood_piercer) then return end
                    ParticleEffect("piercing_blood_spew", self.blood_ball:GetPos(), ply:EyeAngles() + Angle(0,90,0), self)
                    ParticleEffect( "blood_hit", self.blood_piercer:GetPos() + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), self )
                    self:SetHoldType("revolver")
                end)

                timer.Create("looping_sound", 0, 2000, function()
                    if IsValid(self.blood_ball) then
                        self.blood_ball:StartLoopingSound("yuji/blood/piercing_blood_loop.wav")
                    end
                
                end)
                timer.Simple(0.1, function()
                    self.piercing_active = true

                end)

                timer.Simple(0.2, function()
                 

                    if !self.piercing then
                        if !IsValid(self.blood_ball) or !IsValid(self.blood_piercer) then return end

                        self.piercing_active = false
                        self.piercing_projectile = true

                        local hit = false
                        self.blood_piercer:EmitSound("yuji/blood/piercing_blood_end.wav", 400, 100, 1, CHAN_STATIC, SND_NOFLAGS)
                        self.blood_ball:SetModelScale(0.01, 1)

                        if IsValid(self.blood_ball_glow) then
                            self.blood_ball_glow:Remove()
                        end

                        local trace = util.TraceLine({
                            start = ply:GetShootPos(),
                            endpos = ply:GetShootPos() + ( ply:GetAimVector() * 10 ),
                            filter = ply
                        })

                        local trace2 = util.TraceLine({
                            start = ply:GetShootPos(),
                            endpos = ply:GetShootPos() + ( ply:GetAimVector() * 300 ),
                            filter = ply
                        })

                        local trace3 = util.TraceLine({
                            start = ply:GetShootPos(),
                            endpos = ply:GetShootPos() + ( ply:GetAimVector() * 50000 ),
                            filter = ply
                        })

                        self.blood_ball:SetPos(trace.HitPos)
                        self.blood_piercer:SetPos(trace2.HitPos)
                        local detector = trace3.HitPos

                        local dir = (trace.HitPos - ply:EyePos()):GetNormalized()
                        local speed = 6000
                        local movement = dir * speed
                        local movementTime = 0.01
                        local damage = 425

                        timer.Simple(1, function()
                            self.defaultHoldType = "Normal"
                            self:SetHoldType(self.defaultHoldType)
                        end)

                        local function explode()
                            if !IsValid(self.blood_piercer) or hit then return end 
                            hit = true
                            ParticleEffect( "blood_explode", self.blood_piercer:GetPos(), Angle(0,0,0), ent )
        
                            util.ScreenShake(self.blood_piercer:GetPos(), 500, 40, 5, 4000, true)
                            self.blood_piercer:EmitSound("yuji/blood/piercing_end.wav", 400, 100, 1, CHAN_AUTO, SND_SHOULDPAUSE)

                            local entities = ents.FindInSphere(self.blood_piercer:GetPos(), 500)
                
                            for _, ent in ipairs(entities) do
            
                                if ent:IsValid() and ( ent ~= ply ) and !ent:GetNWBool("barrier") then
                                    if SERVER then
            
                                        local dir = (ent:GetPos() - self.blood_piercer:GetPos()):GetNormalized()
                                        local force = 1000
                    
                                        local phys = ent:GetPhysicsObject()
                                        
                                        if IsValid(phys) then
                                            phys:EnableMotion(true)
                                            constraint.RemoveAll(ent)
            
                                            phys:SetVelocity(dir * force)
                                        end
            
                                        ent:SetVelocity((dir * force))
                                        ent:TakeDamage(damage, ply, self)

                                        timer.Create("poison", 0.5, 10, function()
                                            if !IsValid(ent) then return end
                                            ent:TakeDamage(100, ply, self)
                                            ent:EmitSound("yuji/blood/poison.wav", 350,  math.random(80, 120), 1, CHAN_STATIC)
                        
                                            ParticleEffect( "blood_hit", (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )
                            
                                        end)
                                    end
                                end
                            end
            
                            if IsValid(self.blood_piercer) then
                                self.blood_piercer:Remove()
                                
                            end
                            
                            if IsValid(self.blood_ball) then
                        
                                self.blood_ball:StopLoopingSound(1)
                                self.blood_ball:Remove()
                            end
                            
                        end

                        print(detector)

                        timer.Create("piercing_blood_particle", 0.05, 250, function()
                            if !IsValid(self.blood_ball) or !IsValid(self.blood_piercer) then return end
                            ParticleEffect("blood_spew", self.blood_piercer:GetPos(), self.blood_piercer:GetAngles() + Angle(0,90,0), self)
                            ParticleEffect("piercing_blood_spew", self.blood_piercer:GetPos(), self.blood_piercer:GetAngles() + Angle(0,90,0), self)
                            ParticleEffect( "blood_hit", self.blood_piercer:GetPos() + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), self )

                        end)

                        timer.Create("piercing_blood_projectile", 0, 500, function()
                            if !IsValid(self.blood_ball) or !IsValid(self.blood_piercer) then return end
                            
                            if !ply:Alive() then
                                if IsValid(ply.blood_ball) then
                                    ply.blood_ball:Remove()
                                end
                                if IsValid(ply.blood_piercer) then
                                    ply.blood_piercer:Remove()
                                end
                                return
                            end
    
                            local newPos2 = self.blood_ball:GetPos() + movement * movementTime
                            self.blood_ball:SetPos(newPos2)
    
                            local newPos = self.blood_piercer:GetPos() + movement * movementTime
                            self.blood_piercer:SetPos(newPos)
            
                            local entities = ents.FindInSphere(detector, 100)
        
                            for _, ent in ipairs(entities) do
        
                                if ( ent:IsValid() and ent == self.blood_piercer) then
                                    if SERVER then
                                        explode()
                                    end
                                end
                            end
        
                            local entities = ents.FindInSphere(self.blood_piercer:GetPos(), 100)
                
                            for _, ent in ipairs(entities) do
        
                                if ( ent:IsValid() and ent ~= ply and ent:IsSolid() ) and !( ent:GetNWBool("barrier") ) then
                                    if SERVER then
                                        explode()
                                    end
                                end
                            end

                        end)

                        
                        
                    else
                        if IsValid(self.blood_piercer) then
                            self.blood_piercer:SetModelScale(0.001, 1)
                        end
                    end
                   

                end)
         

                timer.Simple(cooldown, function()

                    if self.piercing_projectile then
                        if IsValid(self.blood_ball) then
                
                            self.blood_ball:StopLoopingSound(0)
                            self.blood_ball:Remove()
                        end
                        
                        if IsValid(self.blood_piercer) then
                            self.blood_piercer:Remove()
                        end
                        self.piercing_projectile = false

                        self.piercing_cd = false
                        self.piercing_active = false
                    
                        self:SetHoldType("Normal")
                    end
                end)

            end
        end
    end)
end

function SWEP:Shrine(ply, condition)
    if condition then
        if self.yj_cleave then return end
        self.yj_cleave = true 
    
        local swings = {"minwool/jjk/swing.wav", "minwool/jjk/swing2.wav"}
        local hit   = "yuji/sukuna/dismantle_slash.wav"
        local damage = 250
        local swing
        local range = 300
        local cooldown = 0.5
        
        swing = swings[math.random(#swings)]
    
        local trace = util.TraceHull({
            start = ply:GetShootPos(),
            endpos = ply:GetShootPos() + (ply:GetAimVector() * 600),
            filter = ply,
            mins = Vector(-45, -45, -45),
            maxs = Vector(45, 45, 45)
        })
    
        self:SetHoldType('melee')
        ply:SetAnimation(PLAYER_ATTACK1)
        ply:EmitSound(swing, 340, 100, 1, CHAN_STATIC)
    
        timer.Simple(0.3, function()
            self:SetHoldType(self.defaultHoldType)
        end)
    
        local entities = ents.FindInSphere(trace.HitPos, 100)
        local lentities  = {}
    
        for _, ent in ipairs(entities) do
            if IsValid(ent) and ent ~= ply and ( !ent:IsWorld() and ent:IsSolid() and !ent:GetNWBool("barrier") ) then
                table.insert(lentities, ent)
            end
        end
        
        timer.Simple(0.1, function()
    
            if #lentities > 0 then
    
                ParticleEffect( "smash", trace.HitPos, Angle(0,0,0), ply )
    
            else
                return
            end
    
            for _, ent in ipairs(lentities) do
    
                if IsValid(ent) and SERVER then
    
                    ent:EmitSound(hit, 340, math.random(70,100), 1, CHAN_STATIC)
                    
                    util.ScreenShake( ply:GetPos(), 10, 40, 0.5, 100, true)
        
                    local phys = ent:GetPhysicsObject()
        
                    if IsValid(phys) and SERVER then
                        local dir = (ent:GetPos() - ply:GetPos()):GetNormalized()
                        local force = 100
                        if IsValid(phys) then phys:SetVelocity(dir * force) end
                    end
    
                    timer.Simple(0.1, function()
                        if IsValid(ent) then
                            ent:EmitSound("yuji/shrine/slash_hit.wav", 340, math.random(100,150), 1, CHAN_STATIC)
                            ent:EmitSound("yuji/shrine/cleave.wav", 400, 100, 1, CHAN_STATIC)
                            
                            ent:TakeDamage(damage, ply, self)
                            
                            if IsValid(self.cleave_sprite) then self.cleave_sprite:Remove() end
    
                            if SERVER then
    
                                self.cleave_sprite = ents.Create("env_sprite")
                                self.cleave_glow = ents.Create("env_sprite")
                                self.cleave_light = ents.Create("light_dynamic")
                                local sprite
                                if math.random(1,2) == 1 then
                                    sprite = "yuji/effects/shrine/cleave_across.vmt"
                                    ParticleEffect( "cleave_slash", ent:GetPos() + Vector(0,0, 40), Angle(0,ply:EyeAngles().y + 90 , 0), ply )
    
                                else
                                    sprite = "yuji/effects/shrine/cleave_diagonal.vmt"
                                    ParticleEffect( "cleave_slash", ent:GetPos() + Vector(0,0, 40), Angle( 45, ply:EyeAngles().y + 90 , 0), ply )
    
                                end
    
    
                                if IsValid(self.cleave_sprite) then
                                    self.cleave_sprite:SetKeyValue("rendercolor", "120, 0, 0")
                                    self.cleave_sprite:SetKeyValue("HDRColorScale", "1")
                                    self.cleave_sprite:SetKeyValue("rendermode", "1")
                                    self.cleave_sprite:SetKeyValue("model", sprite)
                                    self.cleave_sprite:SetKeyValue("scale", "0.2")
    
                                    self.cleave_glow:SetKeyValue("rendercolor", "120, 0, 0")
                                    self.cleave_glow:SetKeyValue("HDRColorScale", "1")
                                    self.cleave_glow:SetKeyValue("rendermode", "9")
                                    self.cleave_glow:SetKeyValue("model", "sprites/light_glow03.vmt")
                                    self.cleave_glow:SetKeyValue("scale", "5")
                                    
                                    self.cleave_light:SetKeyValue("brightness", "5")
                                    self.cleave_light:SetKeyValue("distance", "500")
                                    self.cleave_light:SetKeyValue("_light", "20, 0, 0")
        
                                    self.cleave_sprite:Spawn()
                                    self.cleave_glow:Spawn()
    
                                    self.cleave_light:Spawn()
    
                                    self.cleave_glow:SetParent(self.cleave_sprite)
                                    self.cleave_glow:SetLocalPos(Vector(0,0,0))
    
                                    self.cleave_light:SetParent(self.cleave_sprite)
                                    self.cleave_light:SetLocalPos(Vector(0,0,0))
    
                                    self.cleave_sprite:SetPos(ent:GetPos() + Vector(0,0,40))
                           
    
                                    ply.cleave_sprite = self.cleave_sprite
    
                                    timer.Create("cleave_think", 0, 20, function()
                                        if !IsValid(ent) or !IsValid(self.cleave_sprite) then return end
                                
                                        self.cleave_sprite:SetPos(ent:GetPos() + Vector(0,0,40))
    
                                    end)
    
                                    timer.Create("debris", 0, 250, function()
                                        if !ply:Alive() then
                                            if IsValid(ply.cleave_sprite) then
                                                ply.cleave_sprite:Remove()
                                            end
                                        end
                                    end)
                                end
                            end
                        end
                    end)
                   
                end
            end
        end)
    
        timer.Simple(cooldown, function()
            if IsValid(self.cleave_sprite) then
                self.cleave_sprite:Remove()
            end
            self.yj_cleave = false
        end)
        return
    end

    if self.soul_dismantle or !IsValid(ply) then return end
    self.soul_dismantle = true 

    local damage = 350
    local range = 200
    local cooldown = 2
    local speed = 10000

    local entities_hit = {}
        
    self:SetHoldType("slam")
    ply:SetAnimation(PLAYER_ATTACK1)

    timer.Simple(0.5, function()
        self:SetHoldType(self.defaultHoldType)

    end)

    timer.Simple(cooldown, function()
        self.soul_dismantle = false

        if IsValid(self.dismantle_slash) then
            self.dismantle_slash:Remove()
        end
    end)

    if SERVER then
        self.dismantle_slash = ents.Create("prop_dynamic")
        self.dismantle_light = ents.Create("light_dynamic")

        if IsValid(self.dismantle_slash) and IsValid(self.dismantle_light) then
            self.dismantle_slash:SetModel("models/yuji/shrine/dismantle.mdl")
            self.dismantle_slash:SetMaterial("minwool/jjk/solid_glow")
            self.dismantle_slash:SetColor(Color(1, 1, 1, 130))
            self.dismantle_slash:SetModelScale(20)
            self.dismantle_slash:DrawShadow(false)
            self.dismantle_slash:SetRenderMode( RENDERMODE_TRANSALPHA )
            self.dismantle_slash:SetNWBool("barrier")

            self.dismantle_light:SetKeyValue("brightness", "3")
            self.dismantle_light:SetKeyValue("distance", "1000")
            self.dismantle_light:SetKeyValue("_light", "200, 200, 200")

            self.dismantle_slash:Spawn()
            self.dismantle_light:Spawn()
            
            self.dismantle_light:SetParent(self.dismantle_slash)
            self.dismantle_light:SetLocalPos(Vector(0,0,0))

            ply.dismantle_slash = self.dismantle_slash

            local trace = util.TraceLine({
                start = ply:GetShootPos(),
                endpos = ply:GetShootPos() + (ply:GetAimVector() * 0.1),
                filter = ply
            })

            self.dismantle_slash:SetPos(trace.HitPos)

            local angle = ply:EyeAngles()
            angle.r = 0
            local r = math.random(-360,360)
            self.dismantle_slash:SetAngles(angle + Angle(0,0, r))
            
            --local trail = util.SpriteTrail(self.dismantle_slash, 1, Color(255,16,63,121), true, 1000, 0.1, 1, 1/(300+0.1)*0.5, "effects/beam001_white")
            
            local dir = (trace.HitPos - ply:EyePos()):GetNormalized()
            local movement = dir * speed
            local movementTime = 0.01
            
            ParticleEffectAttach("dismantle_hit", PATTACH_POINT_FOLLOW, self.dismantle_slash, 1 )
            ply:EmitSound("yuji/shrine/dismantle_slice.wav", 400, math.random(100,120), 1, CHAN_STATIC )

            timer.Create("dismantle_slice_move", 0.01, 200, function()
                if !IsValid(self.dismantle_slash) then return end

                self.dismantle_slash:SetPos(self.dismantle_slash:GetPos() + movement * movementTime)

                ParticleEffect("dismantle_slice", self.dismantle_slash:GetPos(), Angle(0,0,r), ply )

                if !IsValid(self.dismantle_slash) then return end

                if SERVER then
                
                    local entities = ents.FindInSphere(self.dismantle_slash:GetPos(), range)

                    for _, ent in ipairs(entities) do
                        if ent:IsValid() and (ent ~= ply ) and ( !ent:IsWorld() and ent:IsSolid() and !ent:GetNWBool("barrier") ) then
                            for _,e in ipairs(entities_hit) do
                                if e == ent then return end
                            end
                            ParticleEffect( "dismantle_slash", ent:GetPos() + Vector(0,0,40), self.dismantle_slash:GetAngles() + Angle(0,90,0), ply )
                            ParticleEffect( "dismantle_hit", self.dismantle_slash:GetPos(), Angle(0,0,r), ent )
                            ent:EmitSound("yuji/shrine/dismantle_slice_hit.wav", 400, math.random(70,120), 1, CHAN_STATIC )
                            util.ScreenShake(self.dismantle_slash:GetPos(), 500, 40, 0.1, 5000, true)
                            
                            local phys = ent:GetPhysicsObject()
                            if IsValid(phys) then
                                phys:EnableMotion(true)
                                constraint.RemoveAll(ent)
                            end
                            
                            if math.random(50) == 1 then
                               
                                ent:SetNWBool("sukuna", false)
                                ent:SetNWInt("vessel_mode", 0)

                            end
                            
                            table.insert(entities_hit, ent)
                            ent:TakeDamage(damage, ply, self)
                        end
                    end
                end
            end)
        end
    end
end

function SWEP:SimpleDomain(ply, condition)
    if self.simple_domain then return end
    self.simple_domain = true 
    local cooldown = 0.5
    if !ply:GetNWBool("simple_domain") then
        ply:SetNWBool("simple_domain", true)
        ply:ChatPrint("~ Simple Domain Activated ~")
        ply:EmitSound("minwool/jjk/cursed_energy/simple_domain.wav", 500, 100, 1, CHAN_STATIC, SND_NOFLAGS, 1)

        if SERVER then
            self.s_barrier = ents.Create("prop_dynamic")
            self.sd_light  = ents.Create("light_dynamic")
            if IsValid(self.s_barrier) and IsValid(self.sd_light) then
                self.s_barrier:SetModel("models/hunter/tubes/circle2x2.mdl")
                self.s_barrier:SetModelScale(2) 
                self.s_barrier:SetMaterial("minwool/jjk/solid_glow") 
                self.s_barrier:SetColor(Color(1,1,1,158)) 
                self.s_barrier:SetRenderMode(RENDERMODE_TRANSALPHA)

                self.s_barrier:DrawShadow(false)
                self.s_barrier:SetPos(ply:GetPos() + Vector(0,0,40))

                self.sd_light:SetKeyValue("brightness", "2")
                self.sd_light:SetKeyValue("distance", "300")
                self.sd_light:SetKeyValue("_light", "115, 220, 255")

                self.sd_light:Spawn()
                self.s_barrier:Spawn()

                self.sd_light:SetParent(self.s_barrier)
                self.sd_light:SetLocalPos(Vector(0,0,0))

                self.s_barrier:SetNWBool("barrier")
                ParticleEffect("ce_surge", ply:GetPos() + Vector(0,0,40), Angle(0,0,0), self.rock)
            end
        end
    else
        ply:SetNWBool("simple_domain", false)
        ply:ChatPrint("~ Simple Domain Deactivated ~")
        if IsValid(self.s_barrier) then self.s_barrier:Remove() end
        if condition then
            cooldown = 30
            ply:ChatPrint("Simple Domain is on cooldown ~ 30 seconds")

        end
    end

    timer.Simple(cooldown, function()
        self.simple_domain = false 
        if condition then
            ply:ChatPrint("~ Simple Domain is off cooldown ~")

        end
    end)
end

SWEP.double_jump = false
SWEP.can_db = true

function SWEP:KeyPress(ply, key)

    if key == IN_JUMP then
        if self.double_jump and !ply:OnGround() then
            self:Lunge(ply)
            self.double_jump = false
        end
    end

    if key == IN_USE then
        
        if ply:GetNWBool("yuji_zone") and ply:GetNWInt("yj_mode") == 2 then
            self:Shrine(ply, false)
            
            return 
        end
      
        if ply:GetNWInt("yj_mode") == 1 then
            self:Convergence(ply, false)

        elseif ply:GetNWInt("yj_mode") == 0 then
            self:CursedEnergy(ply, false)

        end

    elseif key == IN_RELOAD then
         
        if ply:GetNWBool("yuji_zone") and ply:GetNWInt("yj_mode") == 2 then
            self:Shrine(ply, true)
            return 
        end

        if ply:GetNWInt("yj_mode") == 1 and !self.piercing_projectile then
            self:Convergence(ply, true)

        elseif ply:GetNWInt("yj_mode") == 0 then
            self:CursedEnergy(ply, true)
        end

    end

    hook.Add("PlayerButtonDown", "boogiewoogie_sdomain", function(ply, button)
        if button == KEY_G and ply:GetActiveWeapon():GetClass() == "yuji" then
            if !IsValid(ply) then return end

            if ply:OnGround() then
                self:SimpleDomain(ply)

            end
        
        end
    end)
end

function SWEP:BlackFlash(ply, damage, lentities, trace)
    --black flash :OO
    if math.random(10) ~= 1 then
        ply:SetNWInt("yuji_pity", 120)

    end

    ply:SetHealth(math.min(ply:Health() + 800, 10000))

    util.ScreenShake( ply:GetPos(), 400, 40, 2, 1000, true)

    if #lentities > 0 then
        ParticleEffect("jjk_black_flash", trace.HitPos, Angle(0,0,0), ply)
    end

    if IsValid(self.bf_initial) then self.bf_initial:Remove() end
    if IsValid(self.bf_plyaura) then self.bf_plyaura:Remove() end

    if SERVER then
        self.bf_sparks  = ents.Create("env_sprite")
        self.bf_stars   = ents.Create("env_sprite")
        self.bf_initial = ents.Create("env_sprite")
        self.bf_light   = ents.Create("light_dynamic")

        self.bf_plyaura = ents.Create("env_sprite")
        self.bf_plylight = ents.Create("light_dynamic")

        if IsValid(self.bf_initial) and IsValid(self.bf_plyaura) then
            self.bf_sparks:SetKeyValue("rendercolor", "255, 255, 255")
            self.bf_sparks:SetKeyValue("HDRColorScale", "1")
            self.bf_sparks:SetKeyValue("rendermode", "9")
            self.bf_sparks:SetKeyValue("model", "minwool/jjk/effects/black_flash/sparks.vmt")
            self.bf_sparks:SetKeyValue("scale", "0.00001")

            self.bf_stars:SetKeyValue("rendercolor", "255, 0, 0")
            self.bf_stars:SetKeyValue("HDRColorScale", "5")
            self.bf_stars:SetKeyValue("rendermode", "9")
            self.bf_stars:SetKeyValue("model", "minwool/jjk/effects/black_flash/sparks_stars.vmt")
            self.bf_stars:SetKeyValue("scale", "0.00001")

            self.bf_initial:SetKeyValue("rendercolor", "255, 255, 255")
            self.bf_initial:SetKeyValue("HDRColorScale", "1")
            self.bf_initial:SetKeyValue("rendermode", "5")
            self.bf_initial:SetKeyValue("model", "minwool/jjk/effects/black_flash/initial_hit.vmt")
            self.bf_initial:SetKeyValue("scale", "4")

            self.bf_light:SetKeyValue("brightness", "3")
            self.bf_light:SetKeyValue("distance", "400")
            self.bf_light:SetKeyValue("_light", "255, 0, 50")

            self.bf_initial:Spawn()
            self.bf_stars:Spawn()
            self.bf_sparks:Spawn()
            self.bf_light:Spawn()

            self.bf_sparks:SetParent(self.bf_initial)
            self.bf_sparks:SetLocalPos(Vector(0,0,0))

            self.bf_stars:SetParent(self.bf_initial)
            self.bf_stars:SetLocalPos(Vector(0,0,0))

            self.bf_light:SetParent(self.bf_initial)
            self.bf_light:SetLocalPos(Vector(0,0,0))

            self.bf_initial:SetPos(trace.HitPos)

            ply.bf_initial = self.bf_initial

            self.bf_plyaura:SetKeyValue("rendercolor", "255, 255, 255")
            self.bf_plyaura:SetKeyValue("HDRColorScale", "1")
            self.bf_plyaura:SetKeyValue("rendermode", "5")
            self.bf_plyaura:SetKeyValue("model", "minwool/jjk/effects/black_flash/initial_hit.vmt")
            self.bf_plyaura:SetKeyValue("scale", "0.5")

            self.bf_plylight:SetKeyValue("brightness", "2")
            self.bf_plylight:SetKeyValue("distance", "200")
            self.bf_plylight:SetKeyValue("_light", "255, 0, 50")

            self.bf_plyaura:Spawn()
            self.bf_plylight:Spawn()

            ply.bf_plyaura = self.bf_plyaura
            self.bf_plylight:SetParent(self.bf_plyaura)
            self.bf_plylight:SetLocalPos(Vector(0,0,0))

            timer.Create("debris", 0, 250, function()
                if !ply:Alive() then
                    if IsValid(ply.bf_initial) then
                        ply.bf_initial:Remove()
                    end
                    if IsValid(ply.bf_plyaura) then
                        ply.bf_plyaura:Remove()
                    end
                end
            end)

            local y = 1
            local x = 0.5

            timer.Simple(0.5, function()              
                timer.Create("sparks_grow", 0.01, 5, function()
                    if !IsValid(ply.bf_initial) then return end
                    y = y + 1
                    self.bf_sparks:SetKeyValue("scale", y)
                    ParticleEffect("jjk_black_flash", trace.HitPos, Angle(0,0,0), ply)

                end)

                timer.Simple(0.5, function()
                    
                    timer.Create("sparks_grow", 0.01, 5, function()
                        y = y - 0.7
                        x = x + 0.2
                        if !IsValid(self.bf_initial) then return end

                        self.bf_sparks:SetKeyValue("scale", y)
                        self.bf_stars:SetKeyValue("scale", x)

                    end)
                    
                end)
            end)
           
            local wait = 5

            if ply:GetNWBool("yuji_zone") then
                wait = 2            
            end
            
            timer.Simple(wait, function()
                
                if IsValid(self.bf_initial) then
                    
                    timer.Create("sparks_grow", 0.05, 10, function()
                        y = y - 0.5
                        x = x - 0.25
                        if !IsValid(self.bf_initial) then return end
                        self.bf_sparks:SetKeyValue("scale", y)
                        self.bf_stars:SetKeyValue("scale", y)

                    end)
                    timer.Simple(1, function()

                        if IsValid(self.bf_initial) then
                            self.bf_initial:Remove()

                        end
                        if IsValid(self.bf_plyaura) then
                            self.bf_plyaura:Remove()

                        end
                    end)
                end
            end)
        end
    end

    for _, ent in ipairs(lentities) do

        if IsValid(ent) and SERVER then
            timer.Create("blackflash_sparks", 0, 500, function()
                if !IsValid(ent) then 
                    
                    if IsValid(self.bf_plyaura) then
                        self.bf_plyaura:Remove()

                    end
                    
                    if IsValid(self.bf_initial) then
                        self.bf_initial:Remove()

                    end

                    return 
                
                end

                if IsValid(self.bf_plyaura) then
                    self.bf_plyaura:SetPos(ply:GetPos() + Vector(0,0,40))
                end

                if IsValid(self.bf_initial) then
                    self.bf_initial:SetPos(ent:GetPos() + Vector(0,0,40))
                    util.ScreenShake( ply:GetPos(), 10, 40, 0.5, 100, true)

                end
            end)

            if ply:GetNWBool("yuji_zone") then
                ent:EmitSound("minwool/jjk/blackflash.wav", 400, 100, 20, CHAN_AUTO, SND_SHOULDPAUSE)
            else
                ent:EmitSound("yuji/blackflash_xl.wav", 400, 100, 20, CHAN_AUTO, SND_SHOULDPAUSE)

            end

            ent:TakeDamage((damage*5), ply, self)            
            util.ScreenShake(ply:GetPos(), 10, 40, 0.5, 100, true)

            local phys = ent:GetPhysicsObject()
            
            if IsValid(phys) and SERVER then
                local dir = (ent:GetPos() - ply:GetPos()):GetNormalized()
                local force = 10000
                if IsValid(phys) then phys:SetVelocity(dir * force) end
                ent:SetVelocity(dir * force) 
            end

            timer.Simple(0.7, function()
                if !IsValid(ent) then return end

                if IsValid(phys) and SERVER then
                    local dir = (ent:GetPos() - ply:GetPos()):GetNormalized()
                    local force = 10000
                    if IsValid(phys) then phys:SetVelocity(dir * force) end
                    ent:SetVelocity(dir * force) 
                end
    
                ent:TakeDamage((damage*5), ply, self)
                local rep = 20

                if ply:GetNWBool("yuji_zone") then
                    rep = 3
                end

                timer.Create("blackflash_surge", 0.1, rep, function()
                    if not IsValid(ent) then return end
                    ent:TakeDamage((damage*0.4), ply, self)
                    ParticleEffect( "jjk_bf_trail", (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )
                end)

                
            end)
            if !ply:GetNWBool("yuji_zone") then
                timer.Simple(5, function()
                    if !IsValid(ent) then return end
                    ent:TakeDamage((damage*5), ply, self)
                    ParticleEffect("jjk_black_flash", ent:GetPos() + Vector(0,0,40), Angle(0,0,0), self)

                end)
            end
        end
    end 

    local entities = ents.FindInSphere( ply:GetPos(), 1000 )

    for _ , ent in ipairs(entities) do
        if ent:IsPlayer() then
            ent:ScreenFade(SCREENFADE.PURGE, Color(255, 255, 255, 247), 0.1, 0.1)
        end
    end

    if ply:GetNWBool("yuji_zone") then 
       
        ply:ChatPrint("ANOTHER BLACK FLASH") 
        ply:SetNWInt("yuji_zone_meter", ply:GetNWInt("yuji_zone_meter") + 50)
        return
    end
    ply:SetNWInt("yuji_zone_meter", 120)
    ply:SetNWBool("yuji_zone", true)
    ply:ChatPrint("BLACK FLASH")
    ply:ChatPrint("~ AWAKENED ~")
    ply:ChatPrint("~ Shrine Cursed Technique gained! ~")

end

function SWEP:DoPunch() -- catch these hands
    local ply = self:GetOwner()
    
    if ( !IsValid(ply) or !SERVER ) then return end

    local swing   = {'minwool/jjk/swing.wav','minwool/jjk/swing2.wav'}
    local hit     = 'minwool/jjk/hit.wav'

    local damage = 40

    swing = swing[math.random(#swing)]

    
    if ply:GetNWBool("yuji_zone") then
        damage = damage*1.5
    end

    local trace = util.TraceHull({
        start = ply:GetShootPos(),
        endpos = ply:GetShootPos() + (ply:GetAimVector() * 400),
        filter = ply,
        mins = {-45,-45,-45},
        maxs = {45,45,45}
      
    })

    local entities = ents.FindInSphere(trace.HitPos, 100)
    local lentities  = {} 

    for _, ent in ipairs(entities) do
        if IsValid(ent) and ent ~= ply and ( !ent:IsWorld() and ent:IsSolid() and !ent:GetNWBool("barrier") ) then
            table.insert(lentities, ent)
        end
    end
        
    self:SetHoldType('fist')
    ply:SetAnimation(PLAYER_ATTACK1)
    timer.Simple(1, function() if IsValid(ply) then self:SetHoldType(self.defaultHoldType) end end)

    timer.Simple(0.1, function()
        ply:EmitSound(swing, 340, math.random(90,100), 1, CHAN_STATIC)

        if #lentities > 0 then

            ParticleEffect( "jjk_normal", trace.HitPos, Angle(0,0,0), ply )
            util.ScreenShake( ply:GetPos(), 10, 40, 0.5, 100, true)

            if math.random(1, ply:GetNWInt("yuji_pity")) == 1 then -- black flash 
                self:BlackFlash(ply, damage, lentities, trace)
                return
            end
        end


        for _, ent in ipairs(lentities) do

            if ( IsValid(ent) and SERVER ) then
            
    
                local phys = ent:GetPhysicsObject()
            
                if IsValid(phys) then
                    local dir = (ent:GetPos() - ply:GetPos()):GetNormalized()
                    local force = 500
                    if IsValid(phys) then phys:SetVelocity(dir * force) end
                end

                
                ent:EmitSound(hit, 340, math.random(80, 100), 2, CHAN_STATIC)
                ent:TakeDamage(damage, ply, self) 

            end
        end
     
    end)
end

function SWEP:PrimaryAttack() 
    if self.lock then return end

    local ply = self:GetOwner()
    if ( !ply:IsValid() ) then return end
    self:DoPunch()
end

function SWEP:SecondaryAttack() 
    if self.lock then return end

    local ply = self:GetOwner()
    if ( !ply:IsValid() ) then return end
    self:Melee(ply)
end

hook.Add("GetFallDamage", "yuji_GetFallDamage", function(ply)-- no more silly fall damage
	if ply:GetActiveWeapon():GetClass() == "yuji" then
		return 0
	end
end)


hook.Add("KeyPress", "yuji", function(ply, key)
    
    if ply:InVehicle() then return end

    local weapon = ply:GetActiveWeapon()

    if IsValid(weapon) and weapon.KeyPress then
        weapon:KeyPress(ply, key)
    end

end)

hook.Add("PlayerButtonDown", "yuji_SwitchModes", function(ply, button)
    if button == KEY_LALT and ply:GetActiveWeapon():GetClass() == "yuji" then
        if ply:GetNWBool("yj_debounce") then return end
        ply:SetNWBool("yj_debounce", true)

        if ply:GetNWBool("yuji_shift") then
            ply:SetNWBool("yj_mode", ply:GetNWBool("yj_mode") - 1)
        else
            ply:SetNWBool("yj_mode", ply:GetNWBool("yj_mode") + 1)
        end
        local max = 1
        if ply:GetNWBool("yuji_zone") then
            max = 2
        end
        if ply:GetNWInt("yj_mode") > max then

            ply:SetNWInt("yj_mode", 0)

        elseif ply:GetNWInt("yj_mode") < 0 then
            
            ply:SetNWInt("yj_mode", max)

        end

        timer.Simple(0.2, function()
            ply:SetNWBool("yj_debounce", false)
        end)
    end
end)


SWEP.zone_delay = 0
SWEP.pierce_delay = 0
SWEP.hp_delay = 0

function SWEP:Think()

    local ply = self:GetOwner()
    
    if !IsValid(ply) then return end

    local currentHealth = ply:Health()
    local maxHealth = self.maxHP

    if ply:GetNWInt("yuji_pity") < 0 then 
        ply:SetNWInt("yuji_pity", 1)
    end
    if ply:GetNWInt("yj_mode") == 2 and !ply:GetNWBool("yuji_zone") then
        ply:SetNWInt("yj_mode", 0)
    end

   if self.lunge and ply:OnGround() then
        self.lunge = false
    end

    if ply:OnGround() then
        self.double_jump = true
    end
    
    local function end_pierce()

        if IsValid(self.blood_ball) then
            
            self.blood_ball:StopLoopingSound(1)
            self.blood_ball:EmitSound("yuji/blood/piercing_blood_end.wav", 400, 100, 1, CHAN_STATIC, SND_NOFLAGS)

            self.blood_ball:Remove()
        end
    
        if IsValid(self.blood_piercer) then
            self.blood_piercer:Remove()
        end
    
        self.piercing_active = false
        self.piercing_cd = false
        self.piercing_projectile = false
        self:SetHoldType("Normal")

    end
    
   

    if self.piercing_active then

        local damage = 10

        if !IsValid(self.blood_ball) or !IsValid(self.blood_piercer) then return end
                        
        if !ply:Alive() then
            if IsValid(ply.blood_ball) then
                ply.blood_ball:Remove()
            end
            if IsValid(ply.blood_piercer) then
                ply.blood_piercer:Remove()
            end
            return
        end
        
        local ball_trace = util.TraceLine({
            start = ply:GetShootPos(),
            endpos = ply:GetShootPos() + ( (ply:GetAimVector() + Vector(0,0,-0.3)) * 50 ),
            filter = ply
        })

        local trace = util.TraceLine({
            start = ply:GetShootPos(),
            endpos = ply:GetShootPos() + ( ply:GetAimVector() * 100000 ),
            filter = ply
        })

        self.blood_ball:SetPos(ball_trace.HitPos)
        self.blood_piercer:SetPos(trace.HitPos)
        self.blood_piercer:SetAngles(ply:EyeAngles())
        self.blood_piercer:EmitSound("yuji/blood/slice_hit.wav", 350, math.random(100,120), 1, CHAN_STATIC, SND_NOFLAGS)
        util.ScreenShake( self.blood_piercer:GetPos(), 10, 40, 0.5, 1000, true)

        local entities = ents.FindInSphere(self.blood_piercer:GetPos(), 500)
                
        for _, ent in ipairs(entities) do

            if ( ent:IsValid() and ent ~= ply and ent:IsSolid() ) and !( ent:GetNWBool("barrier") ) then
                if SERVER then
                    ent:TakeDamage(damage, ply, self)
                    timer.Create("poison", 0.5, 2, function()
                        if !IsValid(ent) then return end
                        ent:TakeDamage(100, ply, self)
                        ent:EmitSound("yuji/blood/poison.wav", 350,  math.random(80, 120), 1, CHAN_STATIC)
    
                        ParticleEffect( "blood_hit", (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )
        
                    end)
                end
            end
        end
    end

    if ply:KeyDown(IN_USE) and ply:GetNWBool("yj_mode") == 1 then
        if self.piercing_active then
            self.piercing = true 
            self:SetHoldType("revolver")
        end
    elseif self.piercing then
        self.piercing = false
        end_pierce()

       
    end

    if currentHealth ~= maxHealth then
        if ply:GetNWBool("yuji_zone") then
            ply:SetHealth(math.min(currentHealth + 3, maxHealth))
        else
            ply:SetHealth(math.min(currentHealth + 1, maxHealth))

        end
    end
    
    if CurTime() > self.pierce_delay then
        local max_meter = 100

        if self.piercing_active then
            
            ply:SetNWInt("yuji_piercing", math.min( ply:GetNWInt("yuji_piercing") - 1, max_meter))  
            if ply:GetNWInt("yuji_piercing") == 0 then
                self.pierce_delay = CurTime() + 5
    
                self.piercing = false
                end_pierce()
            else
                self.pierce_delay = CurTime() + 0.01
            end
        else
            self.pierce_delay = CurTime() + 0.05
            ply:SetNWInt("yuji_piercing", math.min( ply:GetNWInt("yuji_piercing") + 1, max_meter))  

        end

        if ply:GetNWInt("yuji_piercing") > max_meter then
            ply:SetNWInt("yuji_piercing", max_meter)

        end
        if ply:GetNWInt("yuji_piercing") < 0 then
            ply:SetNWInt("yuji_piercing", 0)
        end

        if ply:GetNWInt("yuji_piercing") == max_meter then
            self.piercing_display = false
        else
            self.piercing_display = true

        end
    end

    if CurTime() > self.zone_delay then

        if ply:GetNWBool("yuji_zone") then
            self.zone_delay = CurTime() + 1

            local max_meter = 120
        
            ply:SetNWInt("yuji_zone_meter", math.min( ply:GetNWInt("yuji_zone_meter") - 1, max_meter))  

            if ply:GetNWInt("yuji_zone_meter") < 0 then
                ply:SetNWInt("yuji_zone_meter", 1)
            elseif ply:GetNWInt("yuji_zone_meter") == 0 then
                ply:SetNWBool("yuji_zone", false)
                ply:ChatPrint("~ you are no longer awakened ~")
                ply:ChatPrint("~ Shrine Cursed Technique lost! ~")

                ply:SetNWInt("yuji_zone_meter", max_meter)

            end
            
            if ply:GetNWInt("yuji_zone_meter") > max_meter then
                ply:SetNWInt("yuji_zone_meter", max_meter)
            end

        end
    end

    if IsValid(self.s_barrier) and ply:GetNWBool("simple_domain") then
        self.s_barrier:SetPos(ply:GetPos())

        local orbitRadius   = 100
        local orbitSpeed    = 10
        local offset = Vector(0,0,10)

        local orbitAngle = CurTime() * orbitSpeed
        orbitRadius = math.max(orbitRadius, 0)

        local pos1 = self.s_barrier:GetPos() + Vector(math.cos(orbitAngle) * orbitRadius, math.sin(orbitAngle) * orbitRadius, 0)
        local pos2 = self.s_barrier:GetPos() + Vector(math.cos(orbitAngle + math.pi) * orbitRadius, math.sin(orbitAngle + math.pi) * orbitRadius, 0)
      
        ParticleEffect("ce_simple_domain", pos1 + offset , Angle(0, 0, 0), self)
        ParticleEffect("ce_simple_domain", pos2 + offset, Angle(0, 0, 0), self)
        
    end

    if !ply:OnGround() and ply:GetNWBool("simple_domain") then
        self:SimpleDomain(ply, true)
    end

    if ply:KeyDown(IN_SPEED) then

        if ply:InVehicle() then return end
        ply:SetNWBool("yuji_shift", true)

    elseif ply:GetNWBool("yuji_shift") then
        ply:SetNWBool("yuji_shift", false)
    end

    if !ply:GetNWBool("yuji_equipped") then
        ply:SetHealth(self.maxHP)
        ply:SetNWBool("yuji_equipped", true)
    end

    ply:SetJumpPower(400)
    ply:SetWalkSpeed(800)
    ply:SetRunSpeed(1500)

    if ply:GetNWBool("yuji_zone") then ply:SetWalkSpeed(1000) ply:SetRunSpeed(1500) ply:SetJumpPower(500) end
    if ply:GetNWBool("simple_domain") then ply:SetWalkSpeed(100) ply:SetRunSpeed(200) end

end