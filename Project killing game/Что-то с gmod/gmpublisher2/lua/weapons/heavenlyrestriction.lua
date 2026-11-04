if SERVER then

	AddCSLuaFile ()

end

if CLIENT then
    
    killicon.Add("heavenlyrestriction", "heavenlyrestriction/toji", Color(255, 255, 255))
    SWEP.WepSelectIcon = surface.GetTextureID( "heavenlyrestriction/isoh_wep_icon" )

end

SWEP.PrintName = "Heavenly Restriction"
SWEP.Author = "minwool"
SWEP.Instructions = "the one who left it all behind"

SWEP.Spawnable = true
SWEP.AdminOnly = false

SWEP.Category = "DDF Kaisen"
SWEP.HoldType = "normal"
SWEP.UseHands = true

SWEP.ViewModel = ''
SWEP.WorldModel = 'models/weapons/w_pistol.mdl'

SWEP.UseHands = true

SWEP.Primary.ClipSize = -1
SWEP.Primary.DefaultClip = -1
SWEP.Primary.Automatic = false
SWEP.Primary.Ammo = "none"

SWEP.Secondary.ClipSize = -1
SWEP.Secondary.DefaultClip = -1
SWEP.Secondary.Automatic = false
SWEP.Secondary.Ammo = "none"

SWEP.defaultHoldType = "normal"

SWEP.maxHP = 10000
SWEP.equipped = false

SWEP.barrage = false
SWEP.hv_barrage = false

SWEP.isoh_barrage = false 
SWEP.soul_barrage = false

SWEP.lunge = false
SWEP.dj = false

-- weapon specials
SWEP.soul_split = false
SWEP.soul_slice = false

SWEP.isoh_jabs = false
SWEP.isoh_stab = false

SWEP.grapple = false
SWEP.grapple_hit = false

SWEP.gun_ammo = 10
SWEP.gun_db = false
SWEP.gun_ht = false


hook.Add("PlayerSpawn", "hr_InitializePlayerVariable", function(ply)
    if ( IsValid(ply) ) then

        -- modes
        ply:SetNWBool("hr_debounce", false)
        ply:SetNWInt("hr_weapon", 0) -- 0 fists, 2 isoh, 3 split soul

        ply:SetNWBool("hr_isoh", false)
        ply:SetNWBool("hr_shift", false)

        ply:SetNWBool("heavenly_restricted", false)

    end
end)

function SWEP:Initialize()
 
    local ply = self:GetOwner()

    if ( IsValid(ply) ) then
        self.equipped = false
        self:SetHoldType(self.defaultHoldType)
    end
end

function SWEP:Holster()
    local ply = self:GetOwner()
    if IsValid(ply) then
        if ply:GetNWBool("heavenly_restricted") then
            ply:SetNWBool("heavenly_restricted", false) 
        end
    end

    return true
end


if CLIENT then -- world models
    
	local WorldModel = ClientsideModel(SWEP.WorldModel)

	WorldModel:SetNoDraw(true)

	function SWEP:DrawWorldModel()
    
		local ply = self:GetOwner()
       
		if (IsValid(ply)) then

            WorldModel:SetModelScale(9)

            WorldModel:SetupBones()
            local offsetVec

            if self.gun_ht then
                WorldModel:SetModel('models/weapons/w_pistol.mdl')
                WorldModel:SetModelScale(1)
                offsetVec = Vector(5, -2, -3)
                WorldModel:SetupBones()
            elseif self.grapple_hit and ply:GetNWInt("hr_weapon") == 1 then
                WorldModel:SetModel('models/heavenlyrestriction/weapons/isoh.mdl')
                WorldModel:SetMaterial("isoh")
                WorldModel:SetModelScale(0.01)
                offsetVec = Vector(5, -2, -3)
                WorldModel:SetupBones()
        

            else
                if ply:GetNWBool("hr_weapon") == 1 then -- isoh
                    WorldModel:SetModel("models/heavenlyrestriction/weapons/isoh.mdl")
                    WorldModel:SetMaterial("isoh")
                    offsetVec = Vector(3, -1, -1)
    
                elseif ply:GetNWBool("hr_weapon") == 2 then -- soul blade
                    WorldModel:SetModel("models/heavenlyrestriction/weapons/soulblade.mdl")
                    WorldModel:SetMaterial("heavenlyrestriction/models/soulblade")
                    offsetVec = Vector(3, -1, -7)
                else
                    WorldModel:SetModel('models/weapons/w_pistol.mdl')
                
                    WorldModel:SetModelScale(0.01)
                    WorldModel:SetupBones()
                    offsetVec = Vector(0, 0, 0)

                end
            end
            


            local offsetAng = Angle(180, 0, 0)

			local boneid = ply:LookupBone("ValveBiped.Bip01_R_Hand") -- Right Hand
			if !boneid then return end

			local matrix = ply:GetBoneMatrix(boneid)
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
  
    local ply = LocalPlayer()

    local tool

    if ply:GetNWBool("hr_weapon") == 1 then
        tool = "Inverted Spear of Heaven"
    elseif ply:GetNWBool("hr_weapon") == 2 then
        tool = "Split Soul Katana"
    end

    draw.SimpleText("Heavenly Restriction", "GModNotify", 60, 130, Color(255, 255, 255), TEXT_ALIGN_LEFT, TEXT_ALIGN_TOP)

    if ply:GetNWBool("hr_weapon") == 0 then
        draw.SimpleText("Melee", "GModNotify", 60, 160, Color(200, 200, 200), TEXT_ALIGN_LEFT, TEXT_ALIGN_TOP)
    else
        draw.SimpleText("Cursed Tool: ".. tool, "GModNotify", 60, 160, Color(200, 200, 200), TEXT_ALIGN_LEFT, TEXT_ALIGN_TOP)

    end

    draw.SimpleText("[ALT]: Switch Weapon", "GModNotify", 60, 190, Color(160, 160, 160), TEXT_ALIGN_LEFT, TEXT_ALIGN_TOP)

    -- health bar

    local health = ply:Health()
    
    local barWidth = 500
    local barHeight = 20
    local barX = 60
    local barY = ScrH() - 830
    local healthPercentage = health / self.maxHP

    local healthText = "Health: " .. health .. " / " .. self.maxHP

    surface.SetFont("ScoreboardDefault")
    local textWidth, textHeight = surface.GetTextSize(healthText)
    surface.SetDrawColor(34, 13, 95, 183)
    surface.DrawRect(barX, barY, barWidth, barHeight)
    surface.SetDrawColor(88, 62, 132)
    surface.DrawRect(barX, barY, barWidth * healthPercentage, barHeight)

    surface.SetTextColor(255, 255, 255)
    surface.SetTextPos(barX + 10 / 2, barY - textHeight + 21)
    surface.DrawText(healthText)

end

function SWEP:ISOH(ply, condition)
    if !IsValid(ply) then return end

    if !condition then 
        if self.isoh_stab then return end
        self.isoh_stab = true

        local range = 400
        local damage = 250
        local cooldown = 5

        timer.Simple(cooldown, function() self.isoh_stab = false end)

        ply:EmitSound("heavenlyrestriction/soulblade/ding.wav", 400, 100, 1, CHAN_STATIC, SND_NOFLAGS)

        timer.Simple(0.1, function()
            local trace = util.TraceLine({
                start = ply:GetShootPos(),
                endpos = ply:GetShootPos() + (ply:GetAimVector() * range),
                filter = ply,
              
            })

            self:SetHoldType("melee2")
            ply:SetAnimation(PLAYER_ATTACK1)
            ply:EmitSound("heavenlyrestriction/soulblade/steel.wav", 400, 100, 1, CHAN_STATIC, SND_NOFLAGS)
            util.ScreenShake(ply:GetPos(), 10, 40, 1, 600, true)

            ParticleEffect( "isoh_slice", trace.HitPos, Angle(0,0,0), ply )

            timer.Simple(0.2, function()
                self:SetHoldType("melee")
                ply:SetAnimation(PLAYER_ATTACK1)
                ply:EmitSound("heavenlyrestriction/soulblade/steel.wav", 400, 100, 1, CHAN_STATIC, SND_NOFLAGS)
                ParticleEffect( "isoh_slice", trace.HitPos, ply:EyeAngles() + Angle(0,0,90), ply )
                util.ScreenShake(ply:GetPos(), 10, 40, 1, 600, true)

            end)
            local entities = ents.FindInSphere(trace.HitPos, 600)
            local lentities  = {} 
          
            for _, ent in ipairs(entities) do
                if IsValid(ent) and ent ~= ply and ( !ent:IsWorld() and ent:IsSolid() and !ent:GetNWBool("barrier") ) then
                    table.insert(lentities, ent)
                end
            end
    
    
            for _, ent in ipairs(lentities) do
                if IsValid(ent) then
                    
                    ent:EmitSound("heavenlyrestriction/isoh/heavy_hit.wav", 350, 90, 1, CHAN_STATIC, SND_NOFLAGS)
                    ParticleEffect( "hr_hit", ent:GetPos() + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(0,0,0), ply )
                    
                    if SERVER then
                        ent:EmitSound("heavenlyrestriction/isoh/heavy_hit.wav", 350, 100, 1, CHAN_STATIC, SND_NOFLAGS)
                        ent:TakeDamage(damage, ply, self)
                        if ( ent:GetNWBool("limitless_infEnabled") ) then
                            ent:EmitSound("heavenlyrestriction/isoh/bypass.wav", 340, math.random(80,100), 1, CHAN_STATIC)
                            ent:SetNWBool("stunned", true)
                            ParticleEffect( "isoh_bypass", (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40)), Angle(math.random(50,180),math.random(50,180),math.random(50,180)), ply )
                        end
                         
                    end

                    timer.Simple(0.2, function()
                        if IsValid(ent) then
                            if SERVER then
                                ent:EmitSound("heavenlyrestriction/isoh/heavy_hit.wav", 350, 100, 1, CHAN_STATIC, SND_NOFLAGS)
                                ent:TakeDamage(damage, ply, self)
                                if ( ent:GetNWBool("limitless_infEnabled") ) then
                                    ent:EmitSound("heavenlyrestriction/isoh/bypass.wav", 340, math.random(80,100), 1, CHAN_STATIC)
                                    ent:SetNWBool("stunned", true)
                                    ParticleEffect( "isoh_bypass", (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40)), Angle(math.random(50,180),math.random(50,180),math.random(50,180)), ply )
                                end
                                 
                            end
            
                        end
    
                    end)
                end
            end
       
        end)
    else
        if self.isoh_jabs then return end
        self.isoh_jabs = true

        local range = 300
        local damage = 20
        local cooldown = 5

        timer.Simple(cooldown, function() self.isoh_jabs = false end)

        self:SetHoldType("melee")
        timer.Simple(0.3, function() if IsValid(ply) then self:SetHoldType(self.defaultHoldType) end end)

        ply:SetAnimation(PLAYER_ATTACK1)
        ply:EmitSound("heavenlyrestriction/isoh/heavy_swing.wav", 340, math.random(100, 150), 1, CHAN_STATIC)

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
            if !IsValid(ent) then return end 
            
            timer.Create("hr_isoh_swings", 0.1, 10, function()
                if ( !IsValid(ent) ) then return end
                ParticleEffect( "isoh_slash", (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )
                ParticleEffect( "hr_hit", (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(0,0,0), ply )
                ent:EmitSound("heavenlyrestriction/isoh/heavy_hit.wav", 340, math.random(100,150), 1, CHAN_STATIC)

                if ( ent:GetNWBool("limitless_infEnabled") ) then
                    ent:EmitSound("heavenlyrestriction/isoh/bypass.wav", 340, math.random(80,100), 1, CHAN_STATIC)
                    ent:SetNWBool("stunned", true)
                    ParticleEffect( "isoh_bypass", (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40)), Angle(math.random(50,180),math.random(50,180),math.random(50,180)), ply )
                end
                 
                util.ScreenShake(ply:GetPos(), 10, 40, 0.5, 600, true)

                if SERVER then
                    ent:TakeDamage(damage, ply, self)
                end
            end)
           
        end

    end
end

function SWEP:SoulBlade(ply, condition)
    if !IsValid(ply) then return end
    if !condition then
        if self.soul_slice then return end
        self.soul_slice = true

        local range = 400
        local damage = 250
        local cooldown = 5

        timer.Simple(cooldown, function() self.soul_slice = false end)

        ply:EmitSound("heavenlyrestriction/soulblade/ding.wav", 400, 100, 1, CHAN_STATIC, SND_NOFLAGS)

        timer.Simple(0.1, function()
            local trace = util.TraceLine({
                start = ply:GetShootPos(),
                endpos = ply:GetShootPos() + (ply:GetAimVector() * range),
                filter = ply,
              
            })

            self:SetHoldType("melee2")
            ply:SetAnimation(PLAYER_ATTACK1)
            ply:EmitSound("heavenlyrestriction/soulblade/cross_slash.wav", 400, 100, 1, CHAN_STATIC, SND_NOFLAGS)
            ply:EmitSound("heavenlyrestriction/soulblade/heavy_swing.wav", 400, 100, 1, CHAN_STATIC, SND_NOFLAGS)
            util.ScreenShake(ply:GetPos(), 10, 40, 1, 600, true)

            ParticleEffect( "soulblade_slice", trace.HitPos, Angle(0,0,0), ply )

            timer.Simple(0.2, function()
                self:SetHoldType("melee")
                ply:SetAnimation(PLAYER_ATTACK1)
                ply:EmitSound("heavenlyrestriction/soulblade/cross_slash.wav", 400, 120, 1, CHAN_STATIC, SND_NOFLAGS)
                ply:EmitSound("heavenlyrestriction/soulblade/heavy_swing.wav", 400, 90, 1, CHAN_STATIC, SND_NOFLAGS)
                ParticleEffect( "soulblade_slice", trace.HitPos, ply:EyeAngles() + Angle(0,0,90), ply )
                util.ScreenShake(ply:GetPos(), 10, 40, 1, 600, true)

            end)
            local entities = ents.FindInSphere(trace.HitPos, 600)
            local lentities  = {} 
          
            for _, ent in ipairs(entities) do
                if IsValid(ent) and ent ~= ply and ( !ent:IsWorld() and ent:IsSolid() and !ent:GetNWBool("barrier") ) then
                    table.insert(lentities, ent)
                end
            end
    
    
            for _, ent in ipairs(lentities) do
                if IsValid(ent) then
                    
                    ent:EmitSound("heavenlyrestriction/soulblade/heavy_hit.wav", 350, 90, 1, CHAN_STATIC, SND_NOFLAGS)
                    ParticleEffect( "hr_hit", ent:GetPos() + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(0,0,0), ply )
                    
                    if SERVER then
                        ent:EmitSound("heavenlyrestriction/soulblade/heavy_hit.wav", 350, 100, 1, CHAN_STATIC, SND_NOFLAGS)
                        ent:TakeDamage(damage, ply, self)
                    end

                    timer.Simple(0.2, function()
                        if IsValid(ent) then
                            if SERVER then
                                ent:EmitSound("heavenlyrestriction/soulblade/heavy_hit.wav", 350, 100, 1, CHAN_STATIC, SND_NOFLAGS)
                                ent:TakeDamage((ent:Health()*0.065) + damage, ply, self)
                            end
            
                        end
    
                    end)
                end
            end
       
        end)
        
    else
      
        if self.soul_split then return end
        self.soul_split = true

        local range = 1000
        local damage = 20
        local cooldown = 5

        self:SetHoldType("melee")
        timer.Simple(cooldown, function() self.soul_split = false end)

        ply:SetAnimation(PLAYER_ATTACK1)
        ply:EmitSound("heavenlyrestriction/soulblade/swing.wav", 340, math.random(100, 150), 1, CHAN_STATIC)

        timer.Simple(0.3, function() if IsValid(ply) then self:SetHoldType(ply:GetNWString("hr_holdtype")) end end)

        local trace1 = util.TraceHull({
            start = ply:GetShootPos(),
            endpos = ply:GetShootPos() + (ply:GetAimVector() * range*2),
            filter = function(ent) return ( ent:GetClass() == "prop_physics" ) end,
            maxs = {45, 45, 45},
            mins = {-45, -45, -45}
        })

        local trace2 = util.TraceHull({
            start = ply:GetShootPos(),
            endpos = ply:GetShootPos() + (ply:GetAimVector() * range),
            filter = ply,
            maxs = {45, 45, 45},
            mins = {-45, -45, -45}
        })


        local entities = ents.FindInSphere(trace2.HitPos, range)
        local lentities  = {} 
      
        for _, ent in ipairs(entities) do
            if IsValid(ent) and ent ~= ply and ( !ent:IsWorld() and ent:IsSolid() and !ent:GetNWBool("barrier") ) then
                table.insert(lentities, ent)
            end
        end

     
        for _, ent in ipairs(lentities) do
        
            if ( !IsValid(ent) or !SERVER ) then return end 
            ent:EmitSound("heavenlyrestriction/soulblade/ding.wav", 400, math.random(100,150), 1, CHAN_STATIC)


        end
        timer.Simple(0.5, function()
            timer.Create("hr_soulblade_swings2", 0.01, 25, function()
                for _, ent in ipairs(lentities) do
            
                    if ( !IsValid(ent) or !SERVER ) then return end 
                    ParticleEffect( "soulblade_slash", ent:GetPos() + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )
                    ParticleEffect( "hr_hit", ent:GetPos() + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(0,0,0), ply )
                    ent:EmitSound("heavenlyrestriction/soulblade/heavy_hit.wav", 340, math.random(100,150), 1, CHAN_STATIC)

                    util.ScreenShake(ent:GetPos(), 10, 40, 0.5, 600, true)

                    ent:TakeDamage((ent:Health()*0.003) + damage, ply, self)

                end
            end)
        end)


        local eye = ply:EyeAngles()
        if IsValid(ply) and SERVER then
            local trail = util.SpriteTrail( ply, 0, Color( 255, 255, 255), false, 150, 1, 4, 1 / ( 150 + 1 ) * 0.5, "effects/beam_generic01" )
            timer.Simple(0.3, function()
                SafeRemoveEntity(trail)
            end)
        end
        ply:EmitSound("heavenlyrestriction/soulblade/steel.wav", 500, math.random(100,150), 1, CHAN_STATIC)

        timer.Simple(0.1, function()
            ply:SetPos(trace1.HitPos)
        
        end)
        

        timer.Simple(0.3, function()
            ParticleEffect( "hr_slam2", ply:GetPos(), Angle(0,0,0), ent )
    
        end)
 
    end
end

function SWEP:gun(ply)

    if !IsValid(ply) then return end
    
    if self.gun_db or self.gun_ammo == 0 then return end
    self.gun_db = true
    self.gun_ht = true

    local cd = 3
  

    timer.Simple(cd, function()  
        self.gun_db = false 
    end)
        
    timer.Simple(2, function() self.gun_ht = false end)

    ply:EmitSound("heavenlyrestriction/gun/equip.wav", 350, 100, 1, CHAN_STATIC, SND_NOFLAGS)

    timer.Simple(0.3, function()
        timer.Create("BLICKY", 0.1, 5, function()
            ply:SetAnimation(PLAYER_ATTACK1)

            local bullet = {}
            bullet.Num = 1 
            bullet.Src = ply:GetShootPos() 
            bullet.Dir = ply:GetAimVector()
            bullet.Spread = Vector(0, 0, 0) 
            bullet.Tracer = 1 
            bullet.TracerName = "Tracer"
            bullet.Force = 50 
            bullet.Damage = 250
    
            ply:FireBullets(bullet)
          
        
            ply:EmitSound("heavenlyrestriction/gun/shoot_2.wav", 350, math.random(120, 150), 1, CHAN_STATIC, SND_NOFLAGS) 
        end)
    end)
    

end

function SWEP:heavyBarrage(ply)

    if !IsValid(ply) then return end
    if self.hv_barrage then return end
    self.hv_barrage = true

    local range = 400
    local damage = 100
    local cooldown = 3

    timer.Simple(cooldown, function() self.hv_barrage = false end)

    self:SetHoldType("fist")

    timer.Simple(2, function() if IsValid(ply) then self:SetHoldType(self.defaultHoldType) end end)
    ply:SetAnimation(PLAYER_ATTACK1)

    timer.Create("vs_barrage_think", 0.1, 5, function()
        self:SetHoldType('fist')
        ply:SetAnimation(PLAYER_ATTACK1)
        ply:EmitSound("minwool/jjk/heavy_swing.wav", 340, math.random(100, 150), 1, CHAN_STATIC)

        local trace = util.TraceHull({
            start = ply:GetShootPos(),
            endpos = ply:GetShootPos() + (ply:GetAimVector() * range),
            filter = ply,
            maxs = {45,45,45},
            mins = {-45,-45,-45}
        })

        local entities = ents.FindInSphere(trace.HitPos, 600)
        local lentities  = {} 
    
        for _, ent in ipairs(entities) do
            if IsValid(ent) and ent ~= ply and ( !ent:IsWorld() and ent:IsSolid() and !ent:GetNWBool("barrier") )  then
                table.insert(lentities, ent)
            end
        end
    
        for _, ent in ipairs(lentities) do
            if ( !IsValid(ent) or !SERVER ) then return end 
            ParticleEffect( "hr_normal", (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )
            ent:EmitSound("minwool/jjk/heavy_hit.wav", 340, math.random(100,110), 1, CHAN_STATIC)
            
            ent:TakeDamage(damage, ply, self)
            util.ScreenShake(ply:GetPos(), 10, 40, 0.5, 600, true)

        end
    end)
end

function SWEP:Barrage(ply, num)

    if !IsValid(ply) then return end
    if self.barrage then return end
    self.barrage = true

    local cooldown = 2

    timer.Simple(cooldown, function() self.barrage = false end)

    if num == 1 then
        

        local range = 300
        local damage = 20
       


        self:SetHoldType("melee")
        timer.Simple(0.3, function() if IsValid(ply) then self:SetHoldType(self.defaultHoldType) end end)

        timer.Create("isoh_think", 0.05, 15, function()
            if !IsValid(ply) then return end

            ply:EmitSound("heavenlyrestriction/isoh/swing.wav", 340, math.random(100, 150), 1, CHAN_STATIC)
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
                if IsValid(ent) and ent ~= ply and ( !ent:IsWorld() and ent:IsSolid() and !ent:GetNWBool("barrier") )  then
                    table.insert(lentities, ent)
                end
            end
    
            for _, ent in ipairs(lentities) do
                if !IsValid(ent) then return end 
                
                ParticleEffect( "isoh_slash", trace.HitPos + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(0,ply:EyeAngles().y,math.random(-360,360)), ply )
                ParticleEffect( "hr_hit", (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(0,0,0), ply )
                ent:EmitSound("heavenlyrestriction/isoh/hit.wav", 340, math.random(100,150), 1, CHAN_STATIC)

                if ( ent:GetNWBool("limitless_infEnabled") ) then
                    ent:EmitSound("heavenlyrestriction/isoh/bypass.wav", 340, math.random(80,100), 1, CHAN_STATIC)
                    ent:SetNWBool("stunned", true)
                    ParticleEffect( "isoh_bypass",(ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40)), Angle(math.random(50,180),math.random(50,180),math.random(50,180)), ply )
                end

                util.ScreenShake(ply:GetPos(), 10, 40, 0.5, 600, true)
                ent:TakeDamage(damage, ply, self)
            end
        end)
    elseif num == 2 then
      
        local range = 500
        local damage = 25

        timer.Create("soulblade_barrage", 0.05, 15, function()

            self:SetHoldType("knife")
            ply:SetAnimation(PLAYER_ATTACK1)
            ply:EmitSound("heavenlyrestriction/soulblade/swing.wav", 340, math.random(100, 150), 1, CHAN_STATIC)

            local trace = util.TraceLine({
                start = ply:GetShootPos(),
                endpos = ply:GetShootPos() + ( ply:GetAimVector() * range*1.5 ),
                filter = ply
            })

            local entities = ents.FindInSphere(trace.HitPos, range)
            local lentities  = {} 
        
            for _, ent in ipairs(entities) do
                if IsValid(ent) and ent ~= ply and ( !ent:IsWorld() and ent:IsSolid() and !ent:GetNWBool("barrier") )  then
                    table.insert(lentities, ent)
                end
            end

            for _, ent in ipairs(lentities) do
                if ( !IsValid(ent) or !SERVER ) then return end 
                ParticleEffect( "soulblade_slash", trace.HitPos + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(0,ply:EyeAngles().y,math.random(-360,360)), ply )
                ParticleEffect( "hr_hit", (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(0,0,0), ply )
                ent:EmitSound("heavenlyrestriction/soulblade/heavy_hit.wav", 340, math.random(100,150), 1, CHAN_STATIC)
                ent:TakeDamage((ent:Health()*0.003) + damage, ply, self)
                util.ScreenShake(ply:GetPos(), 10, 40, 0.5, 600, true)

            end
        end)
    else
    
        local range = 400
        local damage = 50

        self:SetHoldType("fist")

        timer.Simple(2, function() if IsValid(ply) then self:SetHoldType(self.defaultHoldType) end end)
        ply:SetAnimation(PLAYER_ATTACK1)

        timer.Create("vs_barrage_think", 0.1, 10, function()
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
                if IsValid(ent) and ent ~= ply and ( !ent:IsWorld() and ent:IsSolid() and !ent:GetNWBool("barrier") )  then
                    table.insert(lentities, ent)
                end
            end
        
            for _, ent in ipairs(lentities) do
                if ( !IsValid(ent) or !SERVER ) then return end 
                ParticleEffect( "hr_normal", (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )
                ent:EmitSound("minwool/jjk/hit.wav", 340, math.random(100,110), 1, CHAN_STATIC)
                
                ent:TakeDamage(damage, ply, self)
                util.ScreenShake(ply:GetPos(), 10, 40, 0.5, 600, true)

            end
        end)

        timer.Simple(1.3, function()
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
                if !IsValid(ent) then return end 
                ParticleEffect( "hr_normal", (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )
                ent:EmitSound("minwool/jjk/heavy_hit.wav", 340, math.random(100,110), 1, CHAN_STATIC)
                ent:TakeDamage(damage*2, ply, self)
                util.ScreenShake(ply:GetPos(), 100, 40, 1, 600, true)
    
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

function SWEP:DoPunch(condition) -- catch these hands
    local ply = self:GetOwner()

    local swing   = {'minwool/jjk/swing.wav','minwool/jjk/swing2.wav'}
    local hit     = 'minwool/jjk/hit.wav'

    local damage = 40
    local range = 400

    if ( condition == 1 ) then
       
        self:SetHoldType('knife')
        damage = damage*2
        hit = "heavenlyrestriction/isoh/hit.wav"
        swing   = 'heavenlyrestriction/isoh/swing.wav'
        range = 600
        ply:EmitSound(swing, 340, math.random(100,200), 1, CHAN_STATIC)


    elseif ( condition == 2 ) then
        self:SetHoldType('melee2')
        hit    = "heavenlyrestriction/soulblade/hit.wav"
        swing  = "heavenlyrestriction/soulblade/swing.wav"
        damage = damage*1.5
        range = 600
        ply:EmitSound(swing, 340, math.random(80,110), 1, CHAN_STATIC)

    else
        self:SetHoldType('fist')
        ply:EmitSound(swing[math.random(#swing)], 340, math.random(90,100), 1, CHAN_STATIC)

    end

    timer.Simple(0.3, function() self:SetHoldType(self.defaultHoldType) end)

    local trace = util.TraceHull({
        start = ply:GetShootPos(),
        endpos = ply:GetShootPos() + (ply:GetAimVector() * range),
        filter = ply,
        maxs = {45,45,45},
        mins = {-45,-45,-45}
      
    })

    local entities = ents.FindInSphere(trace.HitPos, 100)
    local lentities  = {} 

    for _, ent in ipairs(entities) do
        if IsValid(ent) and ent ~= ply and ( !ent:IsWorld() and ent:IsSolid() and !ent:GetNWBool("barrier") )  then
            table.insert(lentities, ent)
        end
    end

    
    ply:SetAnimation(PLAYER_ATTACK1)
    timer.Simple(0.5, function() if IsValid(ply) then self:SetHoldType(self.defaultHoldType) end end)

    if #lentities > 0 then
        
        if (condition == 1) then
            ParticleEffect( "isoh_slash", trace.HitPos, Angle(0,ply:EyeAngles().y,math.random(-360,360)), ply )
        elseif (condition == 2) then
            ParticleEffect( "soulblade_slash", trace.HitPos, Angle(0,ply:EyeAngles().y,math.random(-360,360)), ply )

        else
            ParticleEffect( "hr_normal", trace.HitPos, Angle(0,0,0), ply )

        end
        
    else return end

    for _, ent in ipairs(lentities) do

        if ( IsValid(ent) and SERVER ) then
        
            util.ScreenShake( ply:GetPos(), 10, 40, 0.5, 100, true)

            local phys = ent:GetPhysicsObject()

            if ( IsValid(phys) ) then
                local dir = (ent:GetPos() - ply:GetPos()):GetNormalized()
                local force = 500
                if IsValid(phys) then phys:SetVelocity(dir * force) end
            end

            if ( condition == 1 ) then
                
                if ( !ent:IsValid() ) then return end
                if ( ent:GetNWBool("limitless_infEnabled") and !ent:GetNWBool("stunned_got") ) then
                   
                    ent:SetNWBool("stunned", true)
                    ent:EmitSound("heavenlyrestriction/isoh/bypass.wav", 340, math.random(80,100), 1, CHAN_STATIC)
                    ParticleEffect( "isoh_bypass", trace.HitPos, Angle(math.random(50,180),math.random(50,180),math.random(50,180)), ply )
            
                end

                if (ent:IsPlayer() or ent:IsNPC() or ent:IsNextBot()) then
                    ParticleEffect( "hr_hit", trace.HitPos, Angle(math.random(50,180),math.random(50,180),math.random(50,180)), ply )
                end
        
            elseif ( condition == 2 ) then
                
                if (ent:IsPlayer() or ent:IsNPC() or ent:IsNextBot()) then
                    ParticleEffect( "hr_hit", trace.HitPos, Angle(math.random(50,180),math.random(50,180),math.random(50,180)), ply )
                end
            end

            ent:EmitSound(hit, 340, math.random(80, 100), 1, CHAN_STATIC)
            if ply:GetNWInt("hr_weapon") == 2 then
                ent:TakeDamage((ent:Health()*0.003) + damage, ply, self)       
               
            else
                ent:TakeDamage(damage, ply, self)       

            end
        end
    end
    

end

function SWEP:Grapple(ply)
    
    if self.grapple then return end
    self.grapple = true 
        
    local cooldown = 0.1
    local range = 10000
    local speed = 10000
   
    local detach = false

    if IsValid(self.isoh_grapple) then
        detach = true 
        self.grapple_hit = false
        self.isoh_grapple:Remove()
        cooldown = 1
    end

    timer.Simple(cooldown, function() self.grapple = false end)
    ply:EmitSound("heavenlyrestriction/chain/equip.wav", 350, 150, 1, CHAN_AUTO, SND_NOFLAGS)

    if detach then return end

    self:SetHoldType("melee")
    ply:SetAnimation(PLAYER_ATTACK1)

    timer.Simple(0.3, function() if IsValid(ply) then self:SetHoldType(self.defaultHoldType) end end)

    if SERVER then
        self.isoh_grapple = ents.Create("prop_dynamic")
        local function reel()
            if !IsValid(self.isoh_grapple) or !self.grapple_hit then return end
            local force = 50
            self.isoh_grapple:EmitSound("heavenlyrestriction/chain/hit.wav", 350, 150, 1, CHAN_AUTO, SND_NOFLAGS)

            timer.Create("isoh_pull_world", 0, 1000, function()
                if !IsValid(self.isoh_grapple) or !self.grapple_hit or detach then return end
                if !ply:Alive() then
                    if IsValid(ply.isoh_grapple) then
                        ply.isoh_grapple:Remove()
                    end
                end

                local dir = (ply:GetPos() - self.isoh_grapple:GetPos()):GetNormalized()
                
                ply:SetVelocity(-dir * force)

                
            end)

        end
        if IsValid(self.isoh_grapple) then
            self.isoh_grapple:SetModel("models/heavenlyrestriction/weapons/isoh.mdl")
            self.isoh_grapple:SetMaterial("heavenlyrestriction/models/isoh")
            self.isoh_grapple:SetColor(Color(255, 255, 255))
            self.isoh_grapple:SetModelScale(10)
            self.isoh_grapple:SetMoveType( MOVETYPE_NOCLIP )
            self.isoh_grapple:DrawShadow(false)

            self.isoh_grapple:Spawn()

            ply.isoh_grapple = self.isoh_grapple
            

            local trace = util.TraceLine({
                start = ply:GetShootPos(),
                endpos = ply:GetShootPos() + (ply:GetAimVector() * range),
                filter = ply
            
            })
            local trace2 = util.TraceLine({
                start = ply:GetShootPos(),
                endpos = ply:GetShootPos() + (ply:GetAimVector() * 10),
                filter = ply
                
            })

            self.isoh_grapple:SetPos(trace2.HitPos)
            self.isoh_grapple:SetAngles(ply:EyeAngles()+Angle(90,0,0))

            ply:EmitSound("heavenlyrestriction/chain/chain.wav", 400, 100, 1, CHAN_AUTO, SND_NOFLAGS)

            local rope = constraint.Rope(self.isoh_grapple, ply, 0, 0, Vector(0, 0, 0), Vector(0, 0, 0), 1000, 10000, 0, 10, "heavenlyrestriction/isoh_chain", Color(255,255,255))

            local dir = (trace.HitPos - ply:EyePos()):GetNormalized()
            local movement = dir * speed
            local movementTime = 0.01

            if trace.HitWorld then
                timer.Create("isoh_grapple_think", 0, 500, function()
                    if !IsValid(self.isoh_grapple) or self.grapple_hit or detach then return end
                    if !ply:Alive() then
                        if IsValid(ply.isoh_grapple) then
                            ply.isoh_grapple:Remove()
                        end
                    end
    
                    ParticleEffect("hr_slash_trail", self.isoh_grapple:GetPos(), Angle(0,0,0), self)

                    local newPos = self.isoh_grapple:GetPos() + movement * movementTime
                    self.isoh_grapple:SetPos(newPos)
    
                    local detection = ents.FindInSphere(trace.HitPos, 50)
    
                    for _, ent in ipairs(detection) do
                        if IsValid(ent) and ent == self.isoh_grapple then
                            self.grapple_hit = true
                            reel()
                        end
                    end
    
    
                end)
            elseif trace.Entity then
                if IsValid(trace.Entity) then
                    self.grapple_hit = true
                    local force = 50

                    if SERVER then
                        local ent = trace.Entity
                        ParticleEffect( "isoh_slash", ent:GetPos() + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(math.random(0,360),math.random(0,360),math.random(0,360)), ply )
                        ParticleEffect( "hr_hit", (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40), math.random(-40,40), math.random(-40,40)), Angle(0,0,0), ply )
                        ent:EmitSound("heavenlyrestriction/isoh/heavy_hit.wav", 340, math.random(100,150), 1, CHAN_STATIC)

                        if ( ent:GetNWBool("limitless_infEnabled") ) then
                            ent:EmitSound("heavenlyrestriction/isoh/bypass.wav", 340, math.random(80,100), 1, CHAN_STATIC)
                            ent:SetNWBool("stunned", true)
                            ParticleEffect( "isoh_bypass", (ent:EyePos() - Vector(0, 0, 40) + ent:EyeAngles():Forward()) + Vector(math.random(-40,40)), Angle(math.random(50,180),math.random(50,180),math.random(50,180)), ply )
                        end

                        ent:TakeDamage(500, ply, self)

                    end

                    timer.Create("isoh_grapple_entity", 0, 1000, function()
                        if !IsValid(self.isoh_grapple) or !IsValid(trace.Entity) or detach then 
                            self.grapple_hit = false

                            if IsValid(self.isoh_grapple) then
                                self.isoh_grapple:Remove()

                            end
                        
                            
                            return 
                        end
                        if !ply:Alive() then
                            if IsValid(ply.isoh_grapple) then
                                ply.isoh_grapple:Remove()
                            end
                        end
        
                        ParticleEffect("hr_slash_trail", self.isoh_grapple:GetPos(), Angle(0,0,0), self)
                        self.isoh_grapple:SetPos(trace.Entity:GetPos() + Vector(0,0,40))

                        local dir = (ply:GetPos() - self.isoh_grapple:GetPos()):GetNormalized()
                    
                        ply:SetVelocity(-dir * force)
                        
                    end)
                end
            else
                self.grapple_hit = false

                if IsValid(self.isoh_grapple) then
                    self.isoh_grapple:Remove()

                end
            
            end
            
        end
    end
end

function SWEP:Lunge(ply)
    if !IsValid(ply) or self.lunge then return end
    self.lunge = true 

    local intensity = 2000
  
    ply:EmitSound("minwool/jjk/double_jump.wav", 350, math.random(80,120), 1, CHAN_STATIC)
    ply:SetVelocity( ply:GetAimVector() * intensity )
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
        if ply:GetNWInt("hr_weapon") == 0 then
            self:gun(ply)

        elseif ply:GetNWInt("hr_weapon") == 1 then
            self:ISOH(ply, false)

        elseif ply:GetNWInt("hr_weapon") == 2 then
            self:SoulBlade(ply, false)

        else
            self:gun(ply)
        end
            
    elseif key == IN_RELOAD then
        
        if ply:GetNWInt("hr_weapon") == 0 then
            self:heavyBarrage(ply) 
        elseif ply:GetNWInt("hr_weapon") == 1 then
            self:ISOH(ply, true)

        elseif ply:GetNWInt("hr_weapon") == 2 then
            self:SoulBlade(ply, true)

        else
            --
        end
    end

    hook.Add("PlayerButtonDown", "boogiewoogie_sdomain", function(ply, button)
        if button == KEY_G and ply:GetActiveWeapon():GetClass() == "heavenlyrestriction" then
            if !IsValid(ply) then return end

            self:Grapple(ply)
        end
    end)
   
end

function SWEP:PrimaryAttack() 
    local ply = self:GetOwner()
    if ( !ply:IsValid() ) then return end

    if ( ply:GetNWInt("hr_weapon") == 1 ) then
        self:DoPunch(1)
    elseif ( ply:GetNWInt("hr_weapon") == 2 ) then
        self:DoPunch(2)
    else
        self:DoPunch(0)
    end

end

function SWEP:SecondaryAttack() 
    local ply = self:GetOwner()

    if !ply:IsValid() then return end

    if ( ply:GetNWInt("hr_weapon") == 1 ) then
        self:Barrage(ply, 1)

    elseif ( ply:GetNWInt("hr_weapon") == 2 ) then
        self:Barrage(ply, 2)

    else
        self:Barrage(ply, 0)
    end

end

local function SwitchMode(ply)
    if ( ply:GetNWBool("hr_debounce") or !ply:IsValid() ) then return end
    ply:SetNWBool("hr_debounce", true)

    timer.Simple(0.01, function()
        ply:SetNWBool("hr_debounce", false)
    end)

    if ply:GetNWBool("hr_shift") then
        
        ply:SetNWInt("hr_weapon", ply:GetNWInt("hr_weapon") - 1)

        if ply:GetNWInt("hr_weapon") < 0 then
            ply:SetNWInt("hr_weapon", 2)
        end

        return
    end

    ply:SetNWInt("hr_weapon", ply:GetNWInt("hr_weapon") + 1)

    if ply:GetNWInt("hr_weapon") > 2 then
        ply:SetNWInt("hr_weapon", 0)
    end



end

hook.Add("GetFallDamage", "hr_GetFallDamage", function(ply)
	if ( ply:GetActiveWeapon():GetClass() == "heavenlyrestriction" ) then
		return 0
	end
end)

hook.Add("PlayerButtonDown", "hr_SwitchModes", function(ply, button)
    if ( button == KEY_LALT and ply:GetActiveWeapon():GetClass() == "heavenlyrestriction" ) then
        SwitchMode(ply)
    end
end)

hook.Add("KeyPress", "hr", function(ply, key)
    
    if ply:InVehicle() then return end

    local weapon = ply:GetActiveWeapon()

    if IsValid(weapon) and weapon.KeyPress then
        weapon:KeyPress(ply, key)
    end

end)

SWEP.hp_delay = 0

function SWEP:Think()
    local ply = self:GetOwner()

    if !IsValid(ply) then return end


    if self.gun_ht and self.defaultHoldType ~= "pistol" then
        self.defaultHoldType = "pistol"
        self:SetHoldType(self.defaultHoldType)

    elseif self.gun_ht then
        -- :3
    else
        if ( ply:GetNWInt("hr_weapon") == 0 and self.defaultHoldType ~= 'normal') then
            self.defaultHoldType = "normal"
            self:SetHoldType(self.defaultHoldType)
    
        elseif ( ply:GetNWInt("hr_weapon") == 1 and self.defaultHoldType ~= 'knife') then
            self.defaultHoldType = "knife"
            self:SetHoldType(self.defaultHoldType)
            ply:EmitSound("heavenlyrestriction/isoh/equip.wav", 350, math.random(90,100), 1, CHAN_STATIC, SND_NOFLAGS)
     
        elseif ( ply:GetNWInt("hr_weapon") == 2 and self.defaultHoldType ~= 'melee2' ) then
            self.defaultHoldType = "melee2"
            self:SetHoldType(self.defaultHoldType)
            ply:EmitSound("heavenlyrestriction/soulblade/equip.wav", 350, math.random(100,150), 1, CHAN_STATIC, SND_NOFLAGS)
        
        end
    end

    if self.lunge and ply:OnGround() then
        self.lunge = false
    end

    if ply:OnGround() then
        self.double_jump = true
    end

    if ply:Health() ~= self.maxHP then
    end
    
    if CurTime() > self.hp_delay then
        self.hp_delay = CurTime() + 0.5

        if ply:Health() ~= self.maxHP then
            ply:SetHealth(math.min(ply:Health() + 15, self.maxHP)) 

        end
    end

    if ply:KeyDown(IN_SPEED) then
        ply:SetNWBool("hr_shift", true)

    elseif ply:GetNWBool("hr_shift") then
        ply:SetNWBool("hr_shift", false)
    end

    if !self.equipped then
        self.equipped = true

        ply:SetHealth(self.maxHP)
        ply:SetGravity(1)
        ply:SetJumpPower(500)
        ply:SetNWBool("heavenly_restricted", true)
    end
    ply:SetWalkSpeed(900)
    ply:SetRunSpeed(1200)
end

if SERVER then
    hook.Add("EntityTakeDamage", "jjk_physical_prowess", function(ply, dmginfo)

        if ply:IsPlayer() and ply:IsValid() and ply:GetActiveWeapon():GetClass() == "heavenlyrestriction" then
            dmginfo:ScaleDamage(0.5)

        end
    end)
end
