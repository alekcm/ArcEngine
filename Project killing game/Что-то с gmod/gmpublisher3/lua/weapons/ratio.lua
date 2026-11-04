
if ( SERVER ) then
    
	AddCSLuaFile ()

end


SWEP.PrintName = "Ratio Technique"
SWEP.Author = "minwool"
SWEP.Instructions = "least overworked MAPPA employee"

SWEP.Category  = "DDF Kaisen"
SWEP.Spawnable = true
SWEP.AdminOnly = false

SWEP.HoldType = "normal"
SWEP.UseHands = false

SWEP.ViewModel = ""
SWEP.WorldModel = "models/weapons/blunt_knife.mdl"

SWEP.Primary.ClipSize = -1
SWEP.Primary.DefaultClip = -1
SWEP.Primary.Automatic = false
SWEP.Primary.Ammo = "none"

SWEP.Secondary.ClipSize = -1
SWEP.Secondary.DefaultClip = -1
SWEP.Secondary.Automatic = false
SWEP.Secondary.Ammo = "none"

-- hello code dweller

if CLIENT then
    killicon.Add("ratio", "nanami", Color(255, 255, 255))

end

function SWEP:Initialize()
    local ply = self:GetOwner()

    if SERVER and IsValid(ply) then
        self:SetHoldType("normal")

        ply:SetNWBool("ratio_equipped", false)
    end
    
end

hook.Add("PlayerSpawn", "ratio_InitializePlayerVariable", function(ply)-- tha valueess
    if IsValid(ply) then

        -- base moves
        ply:SetNWBool("ratio_equipped", false)
        ply:SetNWBool("ratio_heavy", false)
        ply:SetNWBool("ratio_punch", false) 
        ply:SetNWBool("ratio_barrage", false) 
        ply:SetNWBool("ratio_collapse1", false) 
        ply:SetNWBool("ratio_collapse2", false) 
        ply:SetNWBool("ratio_collapse_got", false) 

        -- mode switching
        ply:SetNWBool("ratio_debounce", false)

        -- cursed energy
        ply:SetNWInt("ratio_ce", 10000) 

        ply:SetNWInt("ratio_mode", 1) 

        -- toggles
        ply:SetNWBool("ratio_shift", false) 
        ply:SetNWBool("ratio_zone", false)

        --health
        ply:SetNWInt("ratio_maxHP", 8000)

        -- overtime
        ply:SetNWInt("ratio_ov", 0)
        ply:SetNWBool("ratio_overtime", false) 
        ply:SetNWBool("ratio_overtime_r", false)
        ply:SetNWBool("ratio_overtime_db", false) 

        ply:SetNWString("ratio_holdtype", "normal")
        
    end
end)

if CLIENT then
	local WorldModel = ClientsideModel(SWEP.WorldModel)

	-- Settings...
	
    WorldModel:SetNoDraw(true)

	function SWEP:DrawWorldModel()
		local _Owner = self:GetOwner()

		if (IsValid(_Owner)) then
            
            local offsetVec = Vector(4, -1, -1)
            WorldModel:SetModelScale(0.3)
            WorldModel:SetupBones()

            if _Owner:GetNWBool("ratio_mode") == 2 and !_Owner:GetNWBool("ratio_overtime") then 
                WorldModel:SetModel("models/weapons/blunt_knife.mdl")
                WorldModel:SetMaterial("blunt_knife")
                offsetVec = Vector(4, -1, -2)

            elseif _Owner:GetNWBool("ratio_overtime") then
                WorldModel:SetModelScale(0.01)
            else
                WorldModel:SetModelScale(0.01)
            end

            local offsetAng = Angle(-90, 0, 0)

			local boneid = _Owner:LookupBone("ValveBiped.Bip01_R_Hand") -- Right Hand
			if !boneid then return end

			local matrix = _Owner:GetBoneMatrix(boneid)
			if !matrix then return end

			local newPos, newAng = LocalToWorld(offsetVec, offsetAng, matrix:GetTranslation(), matrix:GetAngles())
           
			
			WorldModel:SetPos(newPos)
			WorldModel:SetAngles(newAng)
        
		else
			WorldModel:SetPos(self:GetPos())
			WorldModel:SetAngles(self:GetAngles())
		end

		WorldModel:DrawModel()
	end
end

function SWEP:DrawHUD()
  
    if not CLIENT then return end

    local ply = LocalPlayer()

    mode = "Melee" -- starts on melee
    color =  Color(72, 76, 140) 
    color2 = Color(20, 180, 216) -- normal color
    color3 = Color(50, 50, 50)

    if ply:GetNWInt("ratio_mode") == 1 then
        mode = "Melee"
        color = Color(72, 76, 140) 
    elseif ply:GetNWInt("ratio_mode") == 2 then
        
        mode = "Cursed Tool: Blunt Knife"
        if ply:GetNWBool("ratio_overtime") then
            mode = "Ratio Melee"
        end
        color = Color(186, 186, 186)
    elseif ply:GetNWInt("ratio_mode") == 3 then
        mode = "Extension Technique: Collapse"
        color = Color(83, 83, 255)
    elseif ply:GetNWInt("ratio_mode") == 4 then
        mode = "Binding Vow: Overtime"
        color = Color(0, 195, 255)
    end

    draw.SimpleText("Cursed Technique: Ratio", "Trebuchet24", 60, 130, color2, TEXT_ALIGN_LEFT, TEXT_ALIGN_TOP)
    draw.SimpleText(mode, "Trebuchet24", 60, 160, color, TEXT_ALIGN_LEFT, TEXT_ALIGN_TOP)
    if ply:GetNWBool("ratio_zone") then
        draw.SimpleText("Zone: True", "Trebuchet24", 60, 190, color3, TEXT_ALIGN_LEFT, TEXT_ALIGN_TOP)
    end

    local health = ply:Health()
    local maxHealth = ply:GetNWInt("ratio_maxHP")

    local barWidth = 500
    local barHeight = 20
    local barX = 60
    local barY = ScrH() - 810
    local healthPercentage = health / maxHealth

    local healthText = "Health: " .. health .. " / " .. maxHealth

    surface.SetFont("Trebuchet24")
    local textWidth, textHeight = surface.GetTextSize(healthText)
    surface.SetDrawColor(0, 125, 203, 73)
    surface.DrawRect(barX, barY, barWidth, barHeight)
    surface.SetDrawColor(color2)
    surface.DrawRect(barX, barY, barWidth * healthPercentage, barHeight)

    surface.SetTextColor(255,255,255)
    surface.SetTextPos(barX + 10 / 2, barY - textHeight + 21)
    surface.DrawText(healthText)

    -- cursed energy bar

    local ce = ply:GetNWInt("ratio_ce")
    local maxCE = 10000
    if ply:GetNWBool("ratio_overtime") then
        maxCE = 15000
    end

    local barWidth = 500
    local barHeight = 15
    local barX = 60
    local barY = ScrH() - 790
    local cePercent = ce / maxCE

    local text = "Cursed Energy: " .. ce .. " / " .. maxCE

    surface.SetFont("Trebuchet18")
    local textWidth, textHeight = surface.GetTextSize(text)
    surface.SetDrawColor(0, 0, 0, 60)
    surface.DrawRect(barX, barY, barWidth, barHeight)
    surface.SetDrawColor(color3)
    surface.DrawRect(barX, barY, barWidth * cePercent, barHeight)

    surface.SetTextColor(255,255,255)
    surface.SetTextPos(barX + 10 / 2, barY - textHeight + 17)
    surface.DrawText(text)

    -- overtime bar

    local ov = ply:GetNWInt("ratio_ov")
    local maxOV = 10000

    local barWidth = 500
    local barHeight = 15
    local barX = 60
    local barY = ScrH() - 775
    local cePercent = ov / maxOV

    local text = "OVERTIME"

    surface.SetFont("Trebuchet18")
    local textWidth, textHeight = surface.GetTextSize(text)
    surface.SetDrawColor(0, 0, 0, 60)
    surface.DrawRect(barX, barY, barWidth, barHeight)
    surface.SetDrawColor(95, 157, 255)
    surface.DrawRect(barX, barY, barWidth * cePercent, barHeight)

    surface.SetTextColor(255,255,255)
    surface.SetTextPos(barX + 10 / 2, barY - textHeight + 17)
    surface.DrawText(text)
end

function SWEP:BlackFlash(ply, damage, lentities, trace)
    --black flash :OO

    ply:EmitSound("blackflash.wav", 500, 100, 20, CHAN_AUTO)

    ply:SetNWInt("ratio_ce", ply:GetNWInt("ratio_ce") + 10000)

    util.ScreenShake( ply:GetPos(), 500, 40, 2, 1000, true)

    if #lentities > 0 then
        ParticleEffect("jjk_black_flash", trace.HitPos, Angle(0,0,0), ply)
    end

    for _, ent in ipairs(lentities) do

        if IsValid(ent) and SERVER then

            ent:TakeDamage((damage*5), ply, self)            
            ent:EmitSound("heavyhit.wav", 340, 100, 2, CHAN_AUTO)
            util.ScreenShake(ply:GetPos(), 10, 40, 0.5, 100, true)

            local phys = ent:GetPhysicsObject()
            
            if IsValid(phys) and SERVER then
                local dir = (ent:GetPos() - ply:GetPos()):GetNormalized()
                local force = 10000
                if IsValid(phys) then phys:SetVelocity(dir * force) end
                ent:SetVelocity(dir * force) 
            end

            timer.Simple(0.7, function()
                if not IsValid(ent) then return end

                if IsValid(phys) and SERVER then
                    local dir = (ent:GetPos() - ply:GetPos()):GetNormalized()
                    local force = 10000
                    if IsValid(phys) then phys:SetVelocity(dir * force) end
                    ent:SetVelocity(dir * force) 
                end
    
                ent:TakeDamage((damage*5), ply, self)
                timer.Create("blackflash_surge", 0.05, 10, function()
                    if not IsValid(ent) then return end
                    ent:TakeDamage((damage*0.5), ply, self)
                    ParticleEffect( "jjk_bf_lightning", (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )
                    ParticleEffect( "jjk_bf_trail", (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )

                end)
            end)
        end
    end 

    local entities = ents.FindInSphere( ply:GetPos(), 1000 )

    for _ , ent in ipairs(entities) do
        if ent:IsPlayer() then
            ent:ScreenFade(SCREENFADE.PURGE, Color(1, 1, 1, 255), 0.1, 0.1)

            timer.Simple(0.1, function()
                ent:ScreenFade(SCREENFADE.PURGE, Color(255, 255, 255, 255), 0.1, 0.1)

            end)
        end
    end

    if ply:GetNWBool("ratio_zone") then 
       
        ply:ChatPrint("○ ANOTHER BLACK FLASH ○\n○ YOU ARE STILL IN THE ZONE ○") 
        
        return 
    end

    ply:SetNWBool("ratio_zone", true)
    ply:ChatPrint("○ BLACK FLASH ○\n○ YOU ARE IN THE ZONE ○")
   
    timer.Simple(120, function()
        ply:SetNWBool("ratio_zone", false)
        
        ply:ChatPrint(" ○ YOU ARE NO LONGER IN THE ZONE ○")
        
    end)
end

function SWEP:Melee(ply, key)
    if ( key == IN_RELOAD ) then

        if (ply:GetNWBool("ratio_barrage") or !IsValid(ply)) then return end
        ply:SetNWBool("ratio_barrage", true)

        local range = 600
        local damage = 35
        local cooldown = 3
        local chance = 500
        local effect = "jjk_normal"

        if ply:GetNWBool("ratio_zone") then
            damage = damage*1.5
        end

        if ply:GetNWBool("ratio_overtime") then
            damage = damage*1.5
            chance = 200
            effect = "bk_melee"
        end

        timer.Simple(cooldown, function() ply:SetNWBool("ratio_barrage", false) end)

        self:SetHoldType("fist")
        timer.Simple(2, function() if IsValid(ply) then self:SetHoldType(ply:GetNWString("ratio_holdtype")) end end)

        ply:SetAnimation(PLAYER_ATTACK1)
        ply:EmitSound("swing.wav", 340, math.random(100, 150), 1, CHAN_STATIC)

        timer.Create("vs_swingbarrage", 0.1, 7, function()
            if ( !IsValid(ply) ) then return end
            ply:EmitSound("swing.wav", 340, math.random(100, 150), 1, CHAN_STATIC)
            ply:SetAnimation(PLAYER_ATTACK1)
        end)


        timer.Create("vs_barrage_think", 0.1, 10, function()

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
                if ent:IsValid() and ( ent ~= ply) and ( ent:IsNPC() or ent:IsNextBot() or ent:IsPlayer() or ent:GetClass() == "prop_physics" or ent:IsVehicle() ) and !ent:GetNWBool("barrier") then
                    table.insert(lentities, ent)
                end
            end

            for _, ent in ipairs(lentities) do
                if ( !IsValid(ent) or !SERVER ) then return end 
                ParticleEffect( effect, (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )
                ent:EmitSound("hit.wav", 340, math.random(100,110), 1, CHAN_STATIC)
                ent:TakeDamage(damage, ply, self)
                util.ScreenShake(ply:GetPos(), 10, 40, 0.5, 600, true)
                if math.random(1, chance) == 1 then -- black flash
                    self:BlackFlash(ply, damage, lentities, trace)
                    return
                end
            end
        end)

        timer.Simple(1, function()
            ply:EmitSound("heavy_swing.wav", 340, math.random(100, 150), 1, CHAN_STATIC)

            self:SetHoldType("melee")
            timer.Simple(0.3, function() if IsValid(ply) then self:SetHoldType(ply:GetNWString("ratio_holdtype")) end end)
    
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
                if ent:IsValid() and ( ent ~= ply) and ( ent:IsNPC() or ent:IsNextBot() or ent:IsPlayer() or ent:GetClass() == "prop_physics" or ent:IsVehicle() ) and !ent:GetNWBool("barrier") then
                    table.insert(lentities, ent)
                end
            end

            for _, ent in ipairs(lentities) do
                if ( !IsValid(ent) or !SERVER ) then return end 
                ParticleEffect( effect, (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )
                ent:EmitSound("heavy_hit.wav", 340, math.random(100,110), 1, CHAN_STATIC)
                ent:TakeDamage(damage*2, ply, self)
                util.ScreenShake(ply:GetPos(), 100, 40, 1, 600, true)

                if math.random(1, chance) == 1 then -- black flash
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
end

function SWEP:Knife(ply, key)

    local cost = 1000
    local currentCE = ply:GetNWBool("ratio_ce")

    if ( key == IN_USE ) then
        if !IsValid(ply) or ply:GetNWBool("ratio_knife1") or cost > currentCE or !SERVER then return end
        ply:SetNWBool("ratio_knife1", true) 
        ply:SetNWBool("ratio_ce", ply:GetNWBool("ratio_ce") - cost)

        ply:LagCompensation(true)
    
        local swing = "knife/swing.wav"
        local hit   = "knife/hit.wav"

        if ply:GetNWBool("ratio_overtime") then
            swing = "cursed_energy/swing.wav"
            hit   = "cursed_energy/hit.wav"        
        end
    
        local damage   = 100
        local range    = 600
        local cooldown = 1

        local debris = {}
    
        if ply:GetNWBool("ratio_zone") or ply:GetNWBool("ratio_overtime") then
            damage = damage*1.5
        end
    
    
        timer.Simple(cooldown, function() ply:SetNWBool("ratio_knife1", false) self:SetHoldType(ply:GetNWString("ratio_holdtype")) ply:LagCompensation(false) end)
        
        local trace = util.TraceHull({
            start = ply:GetShootPos(),
            endpos = ply:GetShootPos() + (ply:GetAimVector() * range),
            filter = ply,
            mins = Vector(-45, -45, -45),
            maxs = Vector(45, 45, 45)
    
        })

        self:SetHoldType('knife')
        if ply:GetNWBool("ratio_overtime") then
            self:SetHoldType('fist')
        end

        ply:SetAnimation(PLAYER_ATTACK1)

        timer.Create("knife_strike1", 0.2, 3, function()

            ply:SetAnimation(PLAYER_ATTACK1)
            ply:EmitSound(swing, 340, math.random(70, 100), 1, CHAN_STATIC)

            local trace = util.TraceHull({
                start = ply:GetShootPos(),
                endpos = ply:GetShootPos() + (ply:GetAimVector() * range),
                filter = ply,
                mins = Vector(-45, -45, -45),
                maxs = Vector(45, 45, 45)
            })
            local entities = ents.FindInSphere(trace.HitPos, 100)
            local lentities  = {} 
        
            for _, ent in ipairs(entities) do
                if ent:IsValid() and ( ent ~= ply ) and ( ent:IsNPC() or ent:IsNextBot() or ent:IsPlayer() or ent:GetClass() == "prop_physics" or ent:IsVehicle() and !ent:GetNWBool("barrier") ) then
                    table.insert(lentities, ent)
                end
            end
            
    
            if #lentities > 0 then
            
                if math.random(1,300) == 1 then
                    self:BlackFlash(ply, damage, lentities, trace)
                    return
                end
            
                ParticleEffect( "bk_melee", trace.HitPos, Angle(math.random(-360,360),math.random(-360,360), math.random(-360,360)), ply )
    
            else
                return
            end
    
            for _, ent in ipairs(lentities) do
    
                if IsValid(ent) and SERVER then
                    


                    ent:TakeDamage(damage, ply, self)
                    util.ScreenShake( ply:GetPos(), 10, 40, 0.5, 100, true )
        
                    local phys = ent:GetPhysicsObject()
        
                    if IsValid(phys) and SERVER then
                        local dir = (ent:GetPos() - ply:GetPos()):GetNormalized()
                        local force = 500
                        if IsValid(phys) then phys:SetVelocity(dir * force) end
                    end
    
                    ent:EmitSound(hit, 340, math.random(70, 100), 1, CHAN_STATIC)

                    timer.Simple(0.1, function()
                        if !IsValid(ent) then return end

                        ent:TakeDamage(damage*0.5, ply, self)

                        ent:EmitSound("cursed_energy/ratio.wav", 340, math.random(70, 100), 1, CHAN_STATIC)

                        local ratios = {"sprites/ratio1.vmt", "sprites/ratio2.vmt", "sprites/ratio3.vmt"}
                        
                        self.ratio = ents.Create("env_sprite")

                        if IsValid(self.ratio) then
                            self.ratio:SetKeyValue("rendercolor", "255, 255, 255")
                            self.ratio:SetKeyValue("GlowProxySize", "3")
                            self.ratio:SetKeyValue("HDRColorScale", "1")
                            self.ratio:SetKeyValue("renderfx", "20")
                            self.ratio:SetKeyValue("rendermode", "5")
                            self.ratio:SetKeyValue("renderamt", "255")
                            self.ratio:SetKeyValue("model", ratios[math.random(#ratios)] )
                            self.ratio:SetKeyValue("scale", 0.2)

                            self.ratio:SetAngles(Angle(math.random(-360, 360), math.random(-360, 360), math.random(-360, 360)))

                            self.ratio:Spawn()

                            table.insert(debris, self.ratio)

                            self.ratio:SetPos((ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)))

                        end

                       
                    end)

                end
            end

            timer.Simple(0.7, function()
                for _, r in ipairs(debris) do
                    if IsValid(r) then
                        r:Remove()
                    end
                end
            end)

        end)
    elseif (key == IN_RELOAD) then
        if !IsValid(ply) or ply:GetNWBool("ratio_knife2") or cost > currentCE or !SERVER then return end
        ply:SetNWBool("ratio_knife2", true) 
        ply:SetNWBool("ratio_ce", ply:GetNWBool("ratio_ce") - cost)

        ply:LagCompensation(true)


        local swing = "knife/heavy_swing.wav"
        local hit   = "knife/heavy_hit.wav"
    
        local damage   = 300
        local range    = 600
        local cooldown = 1

        local debris2 = {}
    
        if ply:GetNWBool("ratio_zone") or ply:GetNWBool("ratio_overtime") then
            damage = damage*1.5
        end
    
    
        timer.Simple(cooldown, function() ply:SetNWBool("ratio_knife2", false) self:SetHoldType(ply:GetNWString("ratio_holdtype")) ply:LagCompensation(false) end)
        
        local trace = util.TraceHull({
            start = ply:GetShootPos(),
            endpos = ply:GetShootPos() + (ply:GetAimVector() * range),
            filter = ply,
            mins = Vector(-45, -45, -45),
            maxs = Vector(45, 45, 45)
    
        })

        self:SetHoldType('melee')
        ply:SetAnimation(PLAYER_ATTACK1)
        ply:EmitSound(swing, 340, math.random(70, 100), 1, CHAN_STATIC)

        local entities = ents.FindInSphere(trace.HitPos, 100)
        local lentities  = {} 
    
        for _, ent in ipairs(entities) do
            if ent:IsValid() and ( ent ~= ply ) and ( ent:IsNPC() or ent:IsNextBot() or ent:IsPlayer() or ent:GetClass() == "prop_physics" or ent:IsVehicle() and !ent:GetNWBool("barrier") ) then
                table.insert(lentities, ent)
            end
        end
        

        if #lentities > 0 then
        
            if math.random(1,200) == 1 then
                self:BlackFlash(ply, damage, lentities, trace)
                return
            end
        
            ParticleEffect( "ov_burst", trace.HitPos, Angle(math.random(-360,360),math.random(-360,360), math.random(-360,360)), ply )

        else
            return
        end

        for _, ent in ipairs(lentities) do

            if IsValid(ent) and SERVER then
            
                ent:TakeDamage(damage, ply, self)
                util.ScreenShake( ply:GetPos(), 10, 40, 0.5, 100, true )
    
                local phys = ent:GetPhysicsObject()
    
                if IsValid(phys) and SERVER then
                    local dir = (ent:GetPos() - ply:GetPos()):GetNormalized()
                    local force = 500
                    if IsValid(phys) then phys:SetVelocity(dir * force) end
                end

                ent:EmitSound(hit, 340, math.random(70, 100), 1, CHAN_STATIC)

                timer.Simple(0.1, function()
                    if !IsValid(ent) then return end

                    ent:TakeDamage(damage*0.5, ply, self)

                    ent:EmitSound("cursed_energy/ratio.wav", 400, 100, 1, CHAN_STATIC)
                    ent:EmitSound("cursed_energy/hit.wav", 400, 100, 1, CHAN_STATIC)
                    
                    self.ratio1 = ents.Create("env_sprite")

                    if IsValid(self.ratio1) then
                        self.ratio1:SetKeyValue("rendercolor", "255, 255, 255")
                        self.ratio1:SetKeyValue("GlowProxySize", "3")
                        self.ratio1:SetKeyValue("HDRColorScale", "1")
                        self.ratio1:SetKeyValue("renderfx", "20")
                        self.ratio1:SetKeyValue("rendermode", "5")
                        self.ratio1:SetKeyValue("renderamt", "255")
                        self.ratio1:SetKeyValue("model", "sprites/ratio3.vmt")
                        self.ratio1:SetKeyValue("scale", 0.4)

                        self.ratio1:Spawn()

                        table.insert(debris2, self.ratio1)

                        self.ratio1:SetPos((ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()))

                    end

                    
                end)

            end
        end

        timer.Simple(0.7, function()
            for _, r in ipairs(debris2) do
                if IsValid(r) then
                    r:Remove()
                end
            end
        end)

       
    end
end

function SWEP:Collapse(ply, key)
    local cost = 2000
    local currentCE = ply:GetNWBool("ratio_ce")

    if ( key == IN_USE ) then
        if !IsValid(ply) or ply:GetNWBool("ratio_collapse1") or cost > currentCE or !SERVER then return end
        ply:SetNWBool("ratio_collapse1", true) 
        ply:SetNWBool("ratio_ce", ply:GetNWBool("ratio_ce") - cost)

        ply:LagCompensation(true)
    
        local swing = "cursed_energy/collapse_swing.wav"
        local hit   = "cursed_energy/collapse.wav"
    
        local damage   = 500
        local range    = 400
        local cooldown = 5
    
        if ply:GetNWBool("ratio_zone") or ply:GetNWBool("ratio_overtime") then
            damage = damage*1.5
        end
    
        timer.Simple(0.3, function() self:SetHoldType(ply:GetNWString("ratio_holdtype")) end)

        timer.Simple(cooldown, function() ply:SetNWBool("ratio_collapse1", false) self:SetHoldType(ply:GetNWString("ratio_holdtype")) ply:LagCompensation(false) end)
        
        local trace = util.TraceHull({
            start = ply:GetShootPos(),
            endpos = ply:GetShootPos() + (ply:GetAimVector() * range),
            filter = ply,
            mins = Vector(-45, -45, -45),
            maxs = Vector(45, 45, 45)
    
        })

        self:SetHoldType('melee')
        ply:SetAnimation(PLAYER_ATTACK1)
        ply:EmitSound(swing, 340, 100, 1, CHAN_STATIC)


        local entities = ents.FindInSphere(trace.HitPos, 1500)
        local lentities  = {} 
    
        for _, ent in ipairs(entities) do
            if ent:IsValid() and ( ent ~= ply ) and ( ent:IsNPC() or ent:IsNextBot() or ent:IsPlayer() or ent:GetClass() == "prop_physics" or ent:IsVehicle() and !ent:GetNWBool("barrier") ) then
                table.insert(lentities, ent)
            end
        end
        
        if #lentities > 0 then
        
            if math.random(1,300) == 1 then
                self:BlackFlash(ply, damage, lentities, trace)
                return
            end
        
            ParticleEffect( "rt_collapse", trace.HitPos, Angle(math.random(-360,360),math.random(-360,360), math.random(-360,360)), ply )

        else
            return
        end

        for _, ent in ipairs(lentities) do

            if IsValid(ent) and SERVER then

                ent:TakeDamage(damage, ply, self)
                util.ScreenShake( ply:GetPos(), 10, 40, 0.5, 100, true )
    
                local phys = ent:GetPhysicsObject()
    
                if IsValid(phys) and SERVER then
                    local dir = (ent:GetPos() - ply:GetPos()):GetNormalized()
                    local force = 1000
                    if IsValid(phys) then phys:SetVelocity(dir * force) end
                    ent:SetVelocity(dir * force)

                end

                ent:EmitSound(hit, 340, math.random(70, 100), 1, CHAN_STATIC)

                timer.Create("collapse_surge", 0.1, 10, function()
                    if IsValid(ent) then
                        ParticleEffect( "rt_collapse_trail", ent:GetPos(), Angle(math.random(-360,360),math.random(-360,360), math.random(-360,360)), ply )

                    end
                end)

            end
        end
     
    elseif (key == IN_RELOAD) then
        if !IsValid(ply) or ply:GetNWBool("ratio_collapse2") or cost > currentCE or !SERVER then return end
        ply:SetNWBool("ratio_collapse2", true) 
        ply:SetNWBool("ratio_ce", ply:GetNWBool("ratio_ce") - cost)

        ply:LagCompensation(true)


        local swing = "knife/heavy_swing.wav"
        local hit   = "knife/heavy_hit.wav"
    
        local damage   = 500
        local cooldown = 5
        local range = 1000

        if ply:GetNWBool("ratio_zone") then
            damage = damage*1.5
        end

        
        ply:SetVelocity(Vector(0,0,5000))
        ply:EmitSound("fall.wav", 350, 100, 1, CHAN_STATIC)
        timer.Simple(0.2, function()
            if IsValid(ply) then
                ply:SetVelocity(Vector(0,0,-100000))
            end
        end)

        local function POW()
            if (!IsValid(ply) or !SERVER) then return end

            
            ParticleEffect( "rt_collapse", ply:GetPos(), Angle(0,0,0), ent )
            ply:EmitSound("slam.wav", 400, 100, 1, CHAN_STATIC)
            
            ply:EmitSound("cursed_energy/collapse.wav", 400, 100, 1, CHAN_STATIC)

            util.ScreenShake( ply:GetPos(), 10, 40, 1, range, true)

            local entities = ents.FindInSphere(ply:GetPos(), range)

            for _, ent in ipairs(entities) do
                if ent:IsValid() and ( ent ~= ply ) and ( ent:IsRagdoll() or ent:IsNPC() or ent:IsNextBot() or ent:IsPlayer() or ent:GetClass() == "prop_physics" or ent:IsVehicle() ) and !ent:GetNWBool("barrier") then

                    if IsValid( ent:GetPhysicsObject() ) then
                        if ( ent:GetClass() == "prop_physics" ) then
                            constraint.RemoveAll(ent)
                            ent:GetPhysicsObject():EnableMotion(true)
                        end
                    end
                    
                    local dir = (ent:GetPos() - ply:GetPos()):GetNormalized()
                    local force = 50000
                    local phys = ent:GetPhysicsObject()

                    if IsValid(phys) then phys:SetVelocity(dir * force) end
            
                    if SERVER then
                        ent:TakeDamage(damage, ply, self)
                    end
                end
            end

            ply:SetNWBool("ratio_collapse_got", false)
        end

        timer.Create("rt_slam_think", 0.1, cooldown*10, function()
            
            if !ply:GetNWBool("ratio_collapse_got") then 
                if IsValid(ply) then
                    ParticleEffect( "rt_collapse_trail", ply:GetPos(), Angle(0,0,0), ent )
    
                end
                if ply:OnGround() then
                    POW() 
                    ply:SetNWBool("ratio_collapse_got", true)
                end
                return
            end
            
        end)

        timer.Simple(cooldown+1, function() 
            if !IsValid(ply) then return end
            ply:SetGravity(1) 
            ply:SetNWBool("ratio_collapse2", false) 
            ply:SetNWBool("ratio_collapse_got", false) 
        
        end)
    end
end 

function SWEP:Overtime(ply, key)

    if (key == IN_RELOAD) then
        if !IsValid(ply) or ply:GetNWBool("ratio_overtime_db") or !SERVER then return end

        ply:SetNWBool("ratio_overtime_db", true) 

        if (ply:GetNWInt("ratio_ov") == 10000) then
            ply:ChatPrint("! Overtime Pact Initiated !")
            ply:SetNWBool("ratio_overtime", true)
            ply:EmitSound("cursed_energy/overtime_agree.wav", 500, 100, 1, CHAN_STATIC)
            ply:EmitSound("music/stopAttack.wav", 500, 100, 1, CHAN_STATIC)
            ParticleEffect( "ov_agree", ply:GetPos(), Angle(0,0,0), ply )

        else
            ply:ChatPrint("! Overtime Pact Failed (need more meter) !")

        end
       
        timer.Simple(0.5, function() ply:SetNWBool("ratio_overtime_db", false) end)


    end

end 

function SWEP:KeyPress(ply, key)
    if key == IN_USE or key == IN_RELOAD then
        if ply:GetNWInt("ratio_mode") == 1 then
            self:Melee(ply, key)

        elseif ply:GetNWInt("ratio_mode") == 2 then
            self:Knife(ply, key)

        elseif ply:GetNWInt("ratio_mode") == 3 then
            self:Collapse(ply, key)

        elseif ply:GetNWInt("ratio_mode") == 4 then
            self:Overtime(ply, key)
        else
            self:Melee(ply, key)
            self:SetHoldType(ply:GetNWString("ratio_holdtype"))
        end
    end
end

function SWEP:DoPunch(condition) 
    
    local ply = self:GetOwner()
    
    if not IsValid(ply) or ply:GetNWBool("ratio_punch") or not SERVER then return end

    ply:SetNWBool("ratio_punch", true) 

    ply:LagCompensation(true)

    local swing = "swing.wav"
    local hit   = "hit.wav"

    local damage   = 40
    local range    = 400
    local cooldown = 0.1
    local effect = "jjk_normal"

  


    if (condition == 1) then
        damage = damage*1.5
        swing = "knife/swing.wav"
        hit   = "knife/hit.wav"
        self:SetHoldType('knife')
    elseif (condition == 2) then
        damage = damage*1.5
        swing = "cursed_energy/swing.wav"
        hit   = "cursed_energy/hit.wav"
        effect = "rt_collapse_normal"

        self:SetHoldType('fist')
    else
        self:SetHoldType('fist')

    end
  
    if ply:GetNWBool("ratio_zone") or ply:GetNWBool("ratio_overtime") then
        damage = damage*1.5
    end
    
    if (ply:GetNWBool("ratio_overtime")) then

        swing = "cursed_energy/swing.wav"
        hit   = "cursed_energy/hit.wav"

        self:SetHoldType('fist')

        effect = "bk_melee"

    end

    timer.Simple(cooldown, function() ply:SetNWBool("ratio_punch", false) self:SetHoldType(ply:GetNWString("ratio_holdtype")) ply:LagCompensation(false) end)
    
    local trace = util.TraceHull({
        start = ply:GetShootPos(),
        endpos = ply:GetShootPos() + (ply:GetAimVector() * range),
        filter = ply,
        mins = Vector(-45, -45, -45),
        maxs = Vector(45, 45, 45)

    })

    ply:SetAnimation(PLAYER_ATTACK1)
    ply:EmitSound(swing, 340, math.random(70, 100), 1, CHAN_STATIC)
        
    local entities = ents.FindInSphere(trace.HitPos, 100)
    local lentities  = {} 

    for _, ent in ipairs(entities) do
        if ent:IsValid() and ( ent ~= ply ) and ( ent:IsNPC() or ent:IsNextBot() or ent:IsPlayer() or ent:GetClass() == "prop_physics" or ent:IsVehicle() and !ent:GetNWBool("barrier") ) then
            table.insert(lentities, ent)
        end
    end
    
    timer.Simple(0.1, function()

        if #lentities > 0 then
           
            if math.random(1,400) == 1 then
                self:BlackFlash(ply, damage, lentities, trace)
                return
            end
            if (condition == 1) then
                ParticleEffect( "bk_melee", trace.HitPos, Angle(math.random(-360,360),math.random(-360,360), math.random(-360,360)), ply )

            else
                ParticleEffect( effect, trace.HitPos, Angle(0,0,0), ply )

            end
        else
            return
        end

        for _, ent in ipairs(lentities) do

            if IsValid(ent) and SERVER then
                
                ent:TakeDamage(damage, ply, self)
                util.ScreenShake( ply:GetPos(), 10, 40, 0.5, 100, true )
    
                local phys = ent:GetPhysicsObject()
    
                if IsValid(phys) and SERVER then
                    local dir = (ent:GetPos() - ply:GetPos()):GetNormalized()
                    local force = 500
                    if IsValid(phys) then phys:SetVelocity(dir * force) end
                end

                ent:EmitSound(hit, 340, math.random(70, 100), 1, CHAN_STATIC)
            end
        end
    end)
end

function SWEP:DoHeavy(condition)
    local ply = self:GetOwner()
    
    if not IsValid(ply) or ply:GetNWBool("ratio_heavy") or not SERVER then return end

    ply:SetNWBool("ratio_heavy", true) 

    ply:LagCompensation(true)

    local swing = "heavy_swing.wav"
    local hit   = "heavy_hit.wav"

    local damage   = 75
    local range    = 400
    local cooldown = 0.3
    local effect = "jjk_normal"

    if ply:GetNWBool("ratio_zone") then
        damage = damage*1.5
    end

    if (condition == 1) then
        damage = damage*1.5
        swing = "knife/heavy_swing.wav"
        hit   = "knife/heavy_hit.wav"
    elseif (condition == 2) then
        damage = damage*1.5
        swing = "cursed_energy/swing.wav"
        hit   = "cursed_energy/heavyhit.wav"
        effect = "rt_collapse_normal"
    end

    if ply:GetNWBool("ratio_zone") or ply:GetNWBool("ratio_overtime") then
        damage = damage*1.5
    end
    
    if (ply:GetNWBool("ratio_overtime")) then

        swing = "cursed_energy/swing.wav"
        hit   = "cursed_energy/hit.wav"

        self:SetHoldType('fist')

        effect = "bk_melee"

    end

    timer.Simple(cooldown, function() ply:SetNWBool("ratio_heavy", false) self:SetHoldType(ply:GetNWString("ratio_holdtype")) ply:LagCompensation(false) end)

    local trace = util.TraceHull({
        start = ply:GetShootPos(),
        endpos = ply:GetShootPos() + (ply:GetAimVector() * range),
        filter = ply,
        mins = Vector(-45, -45, -45),
        maxs = Vector(45, 45, 45)

    })

    self:SetHoldType('melee')
    ply:SetAnimation(PLAYER_ATTACK1)
    ply:EmitSound(swing, 340, math.random(70, 100), 1, CHAN_STATIC)
    
    local entities = ents.FindInSphere(trace.HitPos, 100)
    local lentities  = {} 

    for _, ent in ipairs(entities) do
        if ent:IsValid() and ( ent ~= ply ) and ( ent:IsNPC() or ent:IsNextBot() or ent:IsPlayer() or ent:GetClass() == "prop_physics" or ent:IsVehicle() and !ent:GetNWBool("barrier") ) then
            table.insert(lentities, ent)
        end
    end
    
    timer.Simple(0.1, function()

        if #lentities > 0 then

            if math.random(1,200) == 1 then
                self:BlackFlash(ply, damage, lentities, trace)
                return
            end

            if (condition ~= 1) then
                ParticleEffect( effect, trace.HitPos, Angle(0,0,0), ply )

            else
                ParticleEffect( "ov_burst", trace.HitPos, Angle(math.random(-360,360),math.random(-360,360), math.random(-360,360)), ply )

            end

        else
            return
        end

        for _, ent in ipairs(lentities) do

            if IsValid(ent) and SERVER then
                
                ent:TakeDamage(damage, ply, self)
                util.ScreenShake( ply:GetPos(), 10, 40, 0.5, 100, true )
    
                local phys = ent:GetPhysicsObject()
    
                if IsValid(phys) and SERVER then
                    local dir = (ent:GetPos() - ply:GetPos()):GetNormalized()
                    local force = 10000
                    if IsValid(phys) then phys:SetVelocity(dir * force) end
                end

                ent:EmitSound(hit, 340, math.random(70, 100), 1, CHAN_STATIC)
            end
        end 

    end)
    
end

function SWEP:PrimaryAttack()
    local ply = self:GetOwner()

    if (ply:GetNWBool("ratio_overtime")) then
        self:DoPunch(0)
        return
    end

    if (ply:GetNWBool("ratio_mode") == 2) then
        self:DoPunch(1)
    elseif (ply:GetNWBool("ratio_mode") == 3) then
        self:DoPunch(2)

    end
    self:DoPunch(0)
end

function SWEP:SecondaryAttack()
    local ply = self:GetOwner()

    if (ply:GetNWBool("ratio_overtime")) then
        self:DoHeavy(0)
        return
    end

    if (ply:GetNWBool("ratio_mode") == 2) then
        self:DoHeavy(1)
    elseif (ply:GetNWBool("ratio_mode") == 3) then
        self:DoHeavy(2)
    end
    self:DoHeavy(0)
end

local function SwitchMode(ply)
    if ply:GetNWBool("ratio_debounce") then return end
    ply:SetNWBool("ratio_debounce", true)

    timer.Simple(0.05, function()
        ply:SetNWBool("ratio_debounce", false)
    end)

    if ply:GetNWBool("ratio_shift") then
        -- go back a mode

        if IsValid(ply) then
            local current = ply:GetNWInt("ratio_mode")
            ply:SetNWInt("ratio_mode", current - 1)

            if ply:GetNWInt("ratio_mode") <= 0 then
                ply:SetNWInt("ratio_mode", 4)
            end
        end
        return
    end

    -- go up a mode

    if IsValid(ply) then
        local current = ply:GetNWInt("ratio_mode")
        ply:SetNWInt("ratio_mode", current + 1)

        if ply:GetNWInt("ratio_mode") > 4 then
            ply:SetNWInt("ratio_mode", 1)
        end
    end
end

hook.Add("GetFallDamage", "ratio_GetFallDamage", function(ply)-- no more silly fall damage
	if ply:GetActiveWeapon():GetClass() == "ratio" then
		return 0
	end
end)

hook.Add("PlayerButtonDown", "ratio_SwitchModes", function(ply, button)
    if button == KEY_LALT and ply:GetActiveWeapon():GetClass() == "ratio" then
        SwitchMode(ply)
    end
end)

hook.Add("KeyPress", "ratio", function(ply, key)
    
    if ply:InVehicle() then return end

    local weapon = ply:GetActiveWeapon()

    if IsValid(weapon) and weapon.KeyPress then
        weapon:KeyPress(ply, key)
    end

end)

function SWEP:Think()

    local ply = self:GetOwner()
    
    if not IsValid(ply) then return end

    if ( ply:GetNWInt("ratio_mode") ~= 2 and ply:GetNWString("ratio_holdtype") ~= 'normal') then
        ply:SetNWString("ratio_holdtype", "normal")
        self:SetHoldType(ply:GetNWString("ratio_holdtype"))

    elseif ( ply:GetNWInt("ratio_mode") == 2 and ply:GetNWString("ratio_holdtype") ~= 'knife' ) then
        ply:SetNWString("ratio_holdtype", "knife")
        self:SetHoldType(ply:GetNWString("ratio_holdtype"))
        --ply:EmitSound("swing.wav", 340, math.random(10, 20), 1, CHAN_STATIC)

    end
    
    local currentHealth = ply:Health()
    local maxHealth = ply:GetNWInt("ratio_maxHP")
    local maxCE = 10000

    if ply:GetNWBool("ratio_overtime") then
        maxCE = 15000
    end

    local currentCE = ply:GetNWInt("ratio_ce")

    -- overtime
    local maxOV = 10000
    local currentOV = ply:GetNWInt("ratio_ov")

    if ( !ply:GetNWBool("ratio_overtime") ) then
        if currentOV ~= maxOV then
            if ply:GetNWInt("ratio_zone") then
                ply:SetNWInt("ratio_ov", math.min(currentOV + 4, maxOV))
            else
                ply:SetNWInt("ratio_ov", math.min(ply:GetNWInt("ratio_ov") + 2, maxOV))
            end
        elseif ( currentOV == maxOV and !ply:GetNWBool("ratio_overtime_r") ) then
            ply:SetNWBool("ratio_overtime_r", true) 
            if CLIENT then ply:ChatPrint("! Overtime Pact Ready !") end
        elseif currentOV <= 0 then
            ply:SetNWInt("ratio_ov", 1)
        elseif currentOV > maxOV then
            ply:SetNWInt("ratio_ov", maxOV)
        end
    
    else
        if currentOV ~= 0 then
            if ply:GetNWInt("ratio_zone") then
                ply:SetNWInt("ratio_ov", math.min(currentOV -2, maxOV))
            else
                ply:SetNWInt("ratio_ov", math.min(ply:GetNWInt("ratio_ov") - 4, maxOV))
            end
        elseif ( currentOV == 0 and ply:GetNWBool("ratio_overtime") ) then
            ply:SetNWBool("ratio_overtime", false) 
            ply:SetNWBool("ratio_overtime_r", false) 
            if !ply:GetNWBool("ratio_overtime") then
                ParticleEffect( "ov_agree", ply:GetPos(), Angle(0,0,0), ply )
                ply:ChatPrint("! Overtime Pact Ended !")
            end
            
            
        elseif currentOV <= 0 then
            ply:SetNWInt("ratio_ov", 1)
        elseif currentOV > maxOV then
            ply:SetNWInt("ratio_ov", maxOV)
        end
    
    end

    if ply:KeyDown(IN_SPEED) then

        if ply:InVehicle() then return end
        ply:SetNWBool("ratio_shift", true)

    elseif ply:GetNWBool("ratio_shift") then
        ply:SetNWBool("ratio_shift", false)
    end

    if currentCE ~= maxCE then
        if ply:GetNWInt("ratio_zone") then
            ply:SetNWInt("ratio_ce", math.min(currentCE + 5, maxCE))
        else
            timer.Simple(0.5, function()
                ply:SetNWInt("ratio_ce", math.min(ply:GetNWInt("ratio_ce") + 5, maxCE))
                
            end)
        end
    elseif currentCE <= 0 then
        ply:SetNWInt("ratio_ce", 1)
    elseif currentCE > maxCE then
        ply:SetNWInt("ratio_ce", maxCE)
    end

    if ply:Health() ~= maxHealth then
        if ply:GetNWBool("ratio_zone") then
            ply:SetHealth(math.min(ply:Health() + 2, maxHealth))
        else
            ply:SetHealth(math.min(ply:Health() + 1, maxHealth))
        end
    end

    if not ply:GetNWBool("ratio_equipped") then
        ply:SetHealth(maxHealth)
        ply:SetNWInt("ratio_maxHP", maxHealth)
        ply:SetNWBool("ratio_equipped", true)
    end
    
    ply:SetJumpPower(400)
    ply:SetWalkSpeed(900)
    ply:SetRunSpeed(1500)

    ply:SetGravity(1)
    if ply:GetNWBool("ratio_zone") or ply:GetNWBool("ratio_overtime") then ply:SetWalkSpeed(1500) ply:SetRunSpeed(2000) ply:SetJumpPower(500) end

   
    if ply:GetNWInt("ratio_overtime") then
        
        local rightHand = ply:LookupBone("ValveBiped.Bip01_R_Hand")
        if not rightHand then return end
    
        local RHandPos, RHandAng = ply:GetBonePosition(rightHand)
        
        timer.Simple(0.01, function()
            if not IsValid(ply) then return end
            ParticleEffect( "overtime_pact", RHandPos, Angle(0,0,0), ply )
            ParticleEffect( "ov_aura", ply:GetPos() + Vector(0,0,20), Angle(0,0,0), ply )

        end)
    end
end