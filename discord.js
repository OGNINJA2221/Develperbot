const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const token = "MTQzNzA3NDcyMjIwNTcyODgyMA.GiLyhT.pg3Gq3hpSbbIWklpe7r0H2YmdpGq9HNAmyNFbs"; // replace with your bot token
const clientId = "1437074722205728820"; // replace with your bot client ID

// Keep track of members who pressed the button
let pressedMembers = new Set();

// Slash command: setupdev
const commands = [
    new SlashCommandBuilder()
        .setName('setupdev')
        .setDescription('Setup dev groups (Admin only)')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Select members with this role')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('group_size')
                .setDescription('Number of members per group')
                .setRequired(true))
        .toJSON()
];

// Register commands
const rest = new REST({ version: '10' }).setToken(token);
(async () => {
    try {
        await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log('Slash commands registered.');
    } catch (err) {
        console.error(err);
    }
})();

client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));

client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        // "Form Dev Group" pressed
        if (interaction.customId === 'form_dev_group') {
            if (pressedMembers.has(interaction.user.id)) {
                return interaction.reply({ content: 'You already pressed the button!', ephemeral: true });
            }
            pressedMembers.add(interaction.user.id);

            let memberRole = interaction.guild.roles.cache.find(r => r.name === 'member pressed');
            if (!memberRole) {
                memberRole = await interaction.guild.roles.create({ name: 'member pressed', mentionable: false });
            }
            await interaction.member.roles.add(memberRole);
            await interaction.reply({ content: 'You pressed the button! Waiting for groups…', ephemeral: true });
        }

        // Accept group
        if (interaction.customId.startsWith('accept_group_')) {
            const groupName = interaction.customId.split('_')[2];
            await interaction.member.send(`Your group is ${groupName}!`);
            await interaction.reply({ content: 'You accepted!', ephemeral: true });
        }
    }

    // Slash command
    if (interaction.isChatInputCommand() && interaction.commandName === 'setupdev') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: 'Only admins can use this!', ephemeral: true });
        }

        const role = interaction.options.getRole('role');
        const groupSize = interaction.options.getInteger('group_size');

        // Filter members who pressed button and have the role
        const candidates = interaction.guild.members.cache.filter(m =>
            pressedMembers.has(m.id) && m.roles.cache.has(role.id)
        );

        if (candidates.size === 0) {
            return interaction.reply({ content: 'No members pressed the button with that role.', ephemeral: true });
        }

        await interaction.reply({ content: `Found ${candidates.size} members! Creating groups…`, ephemeral: true });

        let membersArray = Array.from(candidates.values());
        let groupCounter = 1;

        while (membersArray.length > 0) {
            const groupMembers = membersArray.splice(0, groupSize);

            // Create group role
            const groupRole = await interaction.guild.roles.create({
                name: `Group ${groupCounter} (${role.name})`,
                mentionable: true
            });

            // Create private text channel
            const groupChannel = await interaction.guild.channels.create({
                name: `group-${groupCounter}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    ...groupMembers.map(m => ({ id: m.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }))
                ]
            });

            // Assign group roles
            groupMembers.forEach(m => m.roles.add(groupRole));

            // Send embed with Accept button
            const acceptRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`accept_group_${groupCounter}`)
                        .setLabel('Accept')
                        .setStyle(ButtonStyle.Primary)
                );

            const embed = new EmbedBuilder()
                .setTitle(`Group ${groupCounter}`)
                .setDescription(`Hello ${groupMembers.map(m => `<@${m.id}>`).join(', ')}! Press Accept to confirm your group.`);

            await groupChannel.send({ embeds: [embed], components: [acceptRow] });

            groupCounter++;
        }

        interaction.followUp({ content: 'Groups created successfully!', ephemeral: true });
    }
});

// Command to deploy Form Dev Group button
client.on('messageCreate', async message => {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;

    if (message.content.toLowerCase() === '!initform') {
        const button = new ButtonBuilder()
            .setCustomId('form_dev_group')
            .setLabel('Form Dev Group')
            .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(button);

        const embed = new EmbedBuilder()
            .setTitle('Join Dev Group')
            .setDescription('Press the button below to join the dev group formation pool.');

        await message.channel.send({ embeds: [embed], components: [row] });
    }
});

client.login(token);
