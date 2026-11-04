util.AddNetworkString("DieOnDDF")
util.AddNetworkString("LiveOnDDF")
util.AddNetworkString("SendTimeDDF")
util.AddNetworkString("TakeTimeDDF")
util.AddNetworkString("EndOfChapter")
util.AddNetworkString("EndOfChapter2")
util.AddNetworkString("ChangeVoiceLenght")
util.AddNetworkString("ChangeVoiceLenght2")
util.AddNetworkString("TimeDDF")
util.AddNetworkString("RagdollPersonal")
util.AddNetworkString("UnRagdollPersonal")
util.AddNetworkString("RagdollPersonalClient")

--[[net.Receive("EndOfChapter", function ()
    net.Start("EndOfChapter2")
    net.Broadcast()
    end)]]
local draw = false
IsDay = true
 Time = "Start"
 Chapter = "-1"

        --[[
        10 = 0.25
        9 = 0.4
        8 = 0.55
        7 = 0.7
        6 = 0.85
        5 = 1
        4 = 1.25
        3 = 1.5
        2 = 1.75
        1 = 2
        --]]

        local damageScaler = {2, 1.75,  1.5,1.25,  1, 0.85, 0.7, 0.55, 0.4, 0.25}

hook.Add( "EntityTakeDamage", "EntityDamageExample", function( target, dmginfo )
    if ( target:IsPlayer()) then
        local scaler = 1
        local PlayerName = target:Name()
        if PlayerName == "Макото Наеги" then 
        scaler = damageScaler[4]
        elseif PlayerName == "Аканэ Овари" then 
        scaler = damageScaler[8]
        elseif PlayerName == "Анджи Йонага" then 
        scaler = damageScaler[3]
        elseif PlayerName == "Аой Асахина" then 
        scaler = damageScaler[6]
        elseif PlayerName == "Чиаки Нанами" then 
        scaler = damageScaler[3]
        elseif PlayerName == "Селестия Люденберг" then 
        scaler = damageScaler[3]
        elseif PlayerName == "Бьякуя Тогами" then 
        scaler = damageScaler[6]
        elseif PlayerName == "Импостер" then 
        scaler = damageScaler[6]
        elseif PlayerName == "Чихиро Фуджисаки" then 
        scaler = damageScaler[1]
        elseif PlayerName == "Фуюхико Кузурю" then 
        scaler = damageScaler[4]
        elseif PlayerName == "Гонта Гокухара" then 
        scaler = damageScaler[9]
        elseif PlayerName == "Гандам Танака" then 
        scaler = damageScaler[7]
        elseif PlayerName == "Хаджиме Хината" then 
        scaler = damageScaler[5]
        elseif PlayerName == "Изуру Камукура" then 
        scaler = damageScaler[10]
        elseif PlayerName == "Хифуми Ямада" then 
        scaler = damageScaler[5]
        elseif PlayerName == "Химико Юмено" then 
        scaler = damageScaler[2]
        elseif PlayerName == "Хиёко Сайонджи" then 
        scaler = damageScaler[2]
        elseif PlayerName == "Ибуки Миода" then 
        scaler = damageScaler[4]
        elseif PlayerName == "Джунко Эношима" then 
        scaler = damageScaler[5]
        elseif PlayerName == "Мукуро Икусаба" then 
        scaler = damageScaler[8]
        elseif PlayerName == "K1-B0" then 
        scaler = damageScaler[10]
        elseif PlayerName == "Каедэ Акаматсу" then 
        scaler = damageScaler[2]
        elseif PlayerName == "Кайто Момота" then 
        scaler = damageScaler[5]
        elseif PlayerName == "Казуичи Сода" then 
        scaler = damageScaler[5]
        elseif PlayerName == "Кируми Тоджо" then 
        scaler = damageScaler[8]
        elseif PlayerName == "Киётака Ишимару" then 
        scaler = damageScaler[6]
        elseif PlayerName == "Кокичи Ома" then 
        scaler = damageScaler[5]
        elseif PlayerName == "Корекиё Шингуджи" then 
        scaler = damageScaler[4]
        elseif PlayerName == "Кёко Киригири" then 
        scaler = damageScaler[4]
        elseif PlayerName == "Леон Кувата" then 
        scaler = damageScaler[6]
        elseif PlayerName == "Махиру Коидзуми" then 
        scaler = damageScaler[3]
        elseif PlayerName == "Маки Харукава" then 
        scaler = damageScaler[8]
        elseif PlayerName == "Микан Цумики" then 
        scaler = damageScaler[3]
        elseif PlayerName == "Миу Ирума" then 
        scaler = damageScaler[5]
        elseif PlayerName == "Мондо Овада" then 
        scaler = damageScaler[7]
        elseif PlayerName == "Нагито Комаеда" then 
        scaler = damageScaler[4]
        elseif PlayerName == "Некомару Нидай" then 
        scaler = damageScaler[9]
        elseif PlayerName == "Пеко Пекояма" then 
        scaler = damageScaler[7]
        elseif PlayerName == "Рантаро Амами" then 
        scaler = damageScaler[7]
        elseif PlayerName == "Рёма Хоши" then 
        scaler = damageScaler[4]
        elseif PlayerName == "Сакура Огами" then 
        scaler = damageScaler[9]
        elseif PlayerName == "Саяка Майзоно" then 
        scaler = damageScaler[4]
        elseif PlayerName == "Шуичи Сайхара" then 
        scaler = damageScaler[4]
        elseif PlayerName == "Сония Невермайнд" then 
        scaler = damageScaler[3]
        elseif PlayerName == "Тенко Чабашира" then 
        scaler = damageScaler[7]
        elseif PlayerName == "Терутеру Ханамура" then 
        scaler = damageScaler[3]
        elseif PlayerName == "Токо Фукава" then 
        scaler = damageScaler[3]
        elseif PlayerName == "Цумуги Широгане" then 
        scaler = damageScaler[3]
        elseif PlayerName == "Ясухиро Хагакуре" then 
        scaler = damageScaler[4]
        elseif PlayerName == "Эмма Магороби" then 
        scaler = damageScaler[4]
        elseif PlayerName == "Шобай Хашимото" then 
        scaler = damageScaler[7]
        elseif PlayerName == "Хибики Отонокоджи" then 
        scaler = damageScaler[1]
        elseif PlayerName == "Ироха Ниджиуэ" then 
        scaler = damageScaler[2]
        elseif PlayerName == "Канаде Отонокоджи" then 
        scaler = damageScaler[4]
        elseif PlayerName == "Кокоро Митсуме" then 
        scaler = damageScaler[2]
        elseif PlayerName == "Хаджиме Макуноучи" then 
        scaler = damageScaler[7]
        elseif PlayerName == "Микадо Санноджи" then 
        scaler = damageScaler[5]
        elseif PlayerName == "Никей Йомиури" then 
        scaler = damageScaler[4]
        elseif PlayerName == "Сетсука Чибукуро" then 
        scaler = damageScaler[5]
        elseif PlayerName == "Шинджи Касай" then 
        scaler = damageScaler[9]
        elseif PlayerName == "Теруя Отори" then 
        scaler = damageScaler[6]
        elseif PlayerName == "Йоруко Кабуя" then 
        scaler = damageScaler[3]
        elseif PlayerName == "Юки Маеда" then 
        scaler = damageScaler[4]
        elseif PlayerName == "Сора" then 
        scaler = damageScaler[6]
        elseif PlayerName == "Юри Кагарин" then 
        scaler = damageScaler[6]
        elseif PlayerName == "Рёта Митарай" then 
        scaler = damageScaler[2]
        elseif PlayerName == "Нико Химуро" then 
        scaler = damageScaler[2]
        elseif PlayerName == "Марин Мизута" then 
        scaler = damageScaler[3]
        elseif PlayerName == "Сейши Йодогава" then 
        scaler = damageScaler[7]
        elseif PlayerName == "Аюму Фуджимори" then 
        scaler = damageScaler[3]
        elseif PlayerName == "Акира Цучия" then 
        scaler = damageScaler[4]
        elseif PlayerName == "Арума Тодороки" then 
        scaler = damageScaler[6]
        elseif PlayerName == "Касуми Изумо" then 
        scaler = damageScaler[3]
        elseif PlayerName == "Казуоми Самеджима" then 
        scaler = damageScaler[7]
        elseif PlayerName == "Кего Сакума" then 
        scaler = damageScaler[5]
        elseif PlayerName == "Майко Кагура" then 
        scaler = damageScaler[4]
        elseif PlayerName == "Микото Итсуки" then 
        scaler = damageScaler[7]
        elseif PlayerName == "Мисузу Айсака" then 
        scaler = damageScaler[5]
        elseif PlayerName == "Мицунари Кога" then 
        scaler = damageScaler[6]
        elseif PlayerName == "Наруми Осоне" then 
        scaler = damageScaler[3]
        elseif PlayerName == "Сайджи Рокудо" then 
        scaler = damageScaler[4]
        elseif PlayerName == "Рёко Отонаши" then 
        scaler = damageScaler[5]
        elseif PlayerName == "Комару Наеги" then 
        scaler = damageScaler[5]
        elseif PlayerName == "Сейко Кимура" then 
        scaler = damageScaler[4]
        elseif PlayerName == "Покет" then 
        scaler = damageScaler[7]
        elseif PlayerName == "Грисп" then 
        scaler = damageScaler[8]
        elseif PlayerName == "Кросс" then 
        scaler = damageScaler[4]
        elseif PlayerName == "Энигма" then 
        scaler = damageScaler[5]
        elseif PlayerName == "Анон" then 
        scaler = damageScaler[1]
        elseif PlayerName == "Мораитеру" then 
        scaler = damageScaler[2]
        elseif PlayerName == "Якси" then 
        scaler = damageScaler[8]
        elseif PlayerName == "Рок" then 
        scaler = damageScaler[5]
        elseif PlayerName == "Рокс" then 
        scaler = damageScaler[4]
        elseif PlayerName == "Рисси" then 
        scaler = damageScaler[2]
        elseif PlayerName == "Скарлет" then 
        scaler = damageScaler[4]
        elseif PlayerName == "Твин" then 
        scaler = damageScaler[4]
        elseif PlayerName == "Канцел" then 
        scaler = damageScaler[3]
        elseif PlayerName == "Корза" then 
        scaler = damageScaler[5]
end
        dmginfo:ScaleDamage( scaler / target:GetNWString("DamageResistance") )
    end
end )


local function SetValues (Values)

    if Values ~= nil then
    draw = Values[1]
    IsDay = Values[2]
    Time = Values[3]
    Chapter = Values[4]
    for k,ply in ipairs (player.GetAll()) do
                    if Chapter == "-1" then
                ply:GodEnable()
                else 
                ply:GodDisable()
                end
            end
        end
    
    end
local function GetValues()
    local Values = {}
    Values[1] = draw
    Values[2] = IsDay
    Values[3] = Time
    Values[4] = Chapter
    return Values
    end
function SendTimeDDF()
        net.Start("TakeTimeDDF")
        net.WriteTable(GetValues())
        net.Broadcast()
    end
net.Receive("SendTimeDDF", function()
        local Values = net.ReadTable()
        SetValues(Values)
        SendTimeDDF()
end)

net.Receive("TimeDDF", function()
    SendTimeDDF()
end)

local function timeMonoNow()
    local time = math.floor(CurTime()) + 1200
    while time > 3600 do
        time = time - 3600
    end
    local hour = math.floor(time / 150)
    local minute = math.floor((time - hour * 150)/150*60)
    if minute < 10 then
        time = hour .. ":0" .. minute 
        return time
    else
        time = hour .. ":" .. minute 
        return time
    end
end

hook.Add( "PlayerDeath", "GlobalDeathMessage", function( victim, inflictor, attacker )
   net.Start("DieOnDDF")
   net.Send(victim)
  -- local entit = ents.Create("TheBodyHasBeenDiscovered")
  -- entit:SetPos(victim:GetPos())
  -- entit:Spawn()
   --entit:SetCollisionGroup(20)
  -- entit:SetNWString("CharacterName", attacker:Name())
  for i,v in ipairs(player:GetAll()) do
    if v:IsSuperAdmin() then
        if(attacker:IsPlayer()) then
            v:ChatPrint("Жертва: ".. victim:Nick().."\nВремя смерти: ".. timeMonoNow().."\nУбийца: "..attacker:Nick())
        else
            v:ChatPrint("Жертва: ".. victim:Nick().."\nВремя смерти: ".. timeMonoNow().."\nУбийца: "..attacker:GetClass())
        end
    end
  end
end )

local PlyToSay

net.Receive("ChangeVoiceLenght2", function (len,ply)
        PlyToSay = ply
    end)

net.Receive("ChangeVoiceLenght", function ()
        local lenght = net.ReadFloat()
        timer.Simple(0.2, function()
        PlyToSay:SetNWFloat("VoiceDistance", lenght)
                end)
    end)

local example = GetConVar( "sbox_maxprops" )
example:SetInt(10)

hook.Add( "PlayerSpawn", "GlobalDeathMessage", function( victim, inflictor)
        victim:SetNWFloat("VoiceDistance", 250)
        if Chapter == "-1" then
            victim:GodEnable()
            else 
            timer.Simple(0.1, function()
            victim:SetMoveType(8)
                    end)
            end
   net.Start("LiveOnDDF")
        net.WriteTable(GetValues())
   net.Send(victim)
   net.Start("SetSpeed")
   net.Send(victim)
   net.Start("SetFood")
   net.Send(victim)
end )

net.Receive("UnRagdollPersonal", function (len,ply)
    local ragd = Entity(net.ReadInt(16))
    local pos = ragd:GetPos()
    pos.z = pos.z + 10
    local vel = ragd:GetVelocity()
    local ang = ragd:GetAngles().yaw
    hook.Remove(  "Think", "MoveRagd" .. ply:Name() )
    hook.Remove(  "KeyPress", "KeyPress" .. ply:Name() )
    hook.Remove(  "PlayerSwitchWeapon", "WeaponSwitch" .. ply:Name() )
    ragd:Remove()
    ply:SetPos(pos)
    ply:SetAngles(Angle(0, ang, 0))
    ply:SetMoveType(MOVETYPE_WALK)
    ply:Freeze(false)
end)

net.Receive("RagdollPersonal", function (len,ply)
     if ply:InVehicle() then
        ply:ExitVehicle()
    end
    local Ragdoll = ents.Create( "prop_ragdoll" )
    Ragdoll:SetModel(ply:GetModel())
    Ragdoll:SetPos(ply:GetPos())
    for k,v in pairs(ply:GetBodyGroups()) do
        Ragdoll:SetBodygroup(v.id,ply:GetBodygroup(v.id))
    end

    Ragdoll:Spawn()

    local matsPly = ply:GetMaterials()
    for i=1,#matsPly do
        local matPly = ply:GetSubMaterial(i)
        Ragdoll:SetSubMaterial(i, matPly)
    end
    ply:SetNWEntity( "Ragdoll", Ragdoll )
    Ragdoll:SetCollisionGroup(true and COLLISION_GROUP_WEAPON or COLLISION_GROUP_NONE)
    
    local PlyVel = ply:GetVelocity()
    
    for ID = 0, Ragdoll:GetPhysicsObjectCount()-1 do
        local PhysBone = Ragdoll:GetPhysicsObjectNum( ID )
        if ( PhysBone:IsValid() ) then
            local Pos, Ang = ply:GetBonePosition( Ragdoll:TranslatePhysBoneToBone( ID ) )
            PhysBone:SetPos( Pos )
            PhysBone:SetAngles( Ang )
            PhysBone:AddVelocity( PlyVel )
        end
    end
    
    Ragdoll.CanConstrain = true
    Ragdoll.GravGunPunt = true
    Ragdoll.PhysgunDisabled = false
    ply:SetMoveType(MOVETYPE_NOCLIP)
    str56 = "MoveRagd" .. ply:Name()
    str57 = "KeyPress" .. ply:Name()
    str58 = "WeaponSwitch" .. ply:Name()
    local PlayerColor = ply:GetPlayerColor()
    Ragdoll.RagColor = Vector(PlayerColor.r, PlayerColor.g, PlayerColor.b)
    ply:Freeze(false)
    hook.Add( "Think", str56 , function()
     		ply:SetPos(Ragdoll:GetPos())
            ply:ConCommand("-forward")
            ply:ConCommand("-back")
            ply:ConCommand("-moveleft")
            ply:ConCommand("-moveright")
    end )
    hook.Add( "KeyPress", str57, function( ply1, key )
        if ( key == IN_ATTACK and ply==ply1) then
            ply1:ConCommand("-attack")
        end
    end )
    ply:SelectWeapon("re_hands")
    hook.Add( "PlayerSwitchWeapon", str58, function( ply2, oldWeapon, newWeapon )
        if ply==ply2 then
            return true
        end
    end )
    timer.Simple(0.1, function()
        net.Start("RagdollPersonalClient")
        net.WriteInt(Ragdoll:EntIndex(), 16)
        net.WriteVector(Ragdoll:GetPos())
        net.WriteAngle(Ragdoll:GetAngles())
        net.Send(ply)
    end)
end)

print ("death has been loaded")

for i,v in ipairs(ents.GetAll()) do
    if v:GetModel()=="models/player/wanderer_pm.mdl" then
        print(v:GetParent())
    end
end